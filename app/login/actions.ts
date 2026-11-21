"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearFailures, createSession, passcodeConfigured, recordFailure, setPasscode, throttle, verifyPasscode } from "@/lib/auth";

export async function loginAction(_: unknown, form: FormData): Promise<{ error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const wait = throttle(ip);
  if (wait) return { error: `Too many attempts. Try again in ${wait} seconds.` };
  const passcode = String(form.get("passcode") ?? "");
  if (!(await passcodeConfigured())) {
    const parsed = z.string().min(8, "Use at least 8 characters.").max(200).safeParse(passcode);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (passcode !== String(form.get("confirm") ?? "")) return { error: "The two passcodes don't match." };
    await setPasscode(passcode);
  } else if (!(await verifyPasscode(passcode))) {
    recordFailure(ip);
    return { error: "That passcode isn't right." };
  }
  clearFailures(ip);
  await createSession();
  redirect("/");
}
