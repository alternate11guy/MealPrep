import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDoc, putDoc } from "./db";

// Single-user passcode authentication with an HMAC-signed, httpOnly session cookie.

const COOKIE = "mise_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface AuthDoc { secret: string; hash?: string; salt?: string }

async function authDoc(): Promise<AuthDoc> {
  let d = await getDoc<AuthDoc>("auth", "main");
  if (!d) {
    d = { secret: crypto.randomBytes(32).toString("hex") };
    await putDoc("auth", "main", d);
  }
  return d;
}

async function secret() {
  return process.env.SESSION_SECRET || (await authDoc()).secret;
}

function sign(payload: string, key: string) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export async function passcodeConfigured() {
  if (process.env.APP_PASSCODE) return true;
  return Boolean((await authDoc()).hash);
}

export async function setPasscode(passcode: string) {
  if (process.env.APP_PASSCODE) throw new Error("The passcode is set by APP_PASSCODE on the server.");
  const d = await authDoc();
  if (d.hash) throw new Error("A passcode is already set.");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(passcode, salt, 64).toString("hex");
  await putDoc("auth", "main", { ...d, salt, hash });
}

export async function changePasscode(current: string, next: string) {
  if (process.env.APP_PASSCODE) throw new Error("The passcode is set by APP_PASSCODE on the server; change it there.");
  if (!(await verifyPasscode(current))) throw new Error("Current passcode is incorrect.");
  const d = await authDoc();
  const salt = crypto.randomBytes(16).toString("hex");
  await putDoc("auth", "main", { ...d, salt, hash: crypto.scryptSync(next, salt, 64).toString("hex") });
}

export async function verifyPasscode(passcode: string) {
  const env = process.env.APP_PASSCODE;
  if (env) {
    const a = Buffer.from(crypto.createHash("sha256").update(passcode).digest());
    const b = Buffer.from(crypto.createHash("sha256").update(env).digest());
    return crypto.timingSafeEqual(a, b);
  }
  const d = await authDoc();
  if (!d.hash || !d.salt) return false;
  const h = crypto.scryptSync(passcode, d.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(d.hash, "hex"));
}

// Basic in-memory throttle against guessing.
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now) return Math.ceil((a.until - now) / 1000);
  return 0;
}
export function recordFailure(key: string) {
  const a = attempts.get(key) ?? { n: 0, until: 0 };
  a.n++;
  if (a.n >= 5) { a.until = Date.now() + Math.min(15 * 60_000, 2 ** (a.n - 5) * 30_000); }
  attempts.set(key, a);
}
export function clearFailures(key: string) { attempts.delete(key); }

export async function createSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `v1.${exp}`;
  const token = `${payload}.${sign(payload, await secret())}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAuthenticated() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(payload, await secret());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}

/** Call at the top of every server action, route handler and protected page. */
export async function requireAuth() {
  if (!(await isAuthenticated())) redirect("/login");
}

export async function assertAuth() {
  if (!(await isAuthenticated())) throw new Error("Not signed in");
}
