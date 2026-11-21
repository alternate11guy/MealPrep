export function uid(prefix = "") {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + r.replace(/-/g, "").slice(0, 12);
}

/** Dates are handled as local calendar days in YYYY-MM-DD form. */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function mondayOf(s: string) {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function todayISO(tz?: string) {
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return parts;
  }
  return toISODate(new Date());
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);
}

export function weekDates(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatDay(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return parseISODate(s).toLocaleDateString("en-GB", opts);
}

/** Mulberry32 seeded PRNG for reproducible plan generation. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

export function grams(g: number) {
  if (g >= 1000) return `${(g / 1000).toFixed(g >= 10000 ? 1 : 2).replace(/\.?0+$/, "")} kg`;
  if (g < 10) return `${g.toFixed(1).replace(/\.0$/, "")} g`;
  return `${Math.round(g)} g`;
}

export const SLOT_LABEL: Record<string, string> = {
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", supplement: "Supplement",
};

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
