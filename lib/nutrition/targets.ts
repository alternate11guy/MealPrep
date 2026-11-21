// Pure target and formatting helpers, safe to import from client components.
import type { Nutrients, Target, Targets } from "@/lib/types";

/** Energy from macros at 4/4/9 kcal per gram (Atwater general factors). */
export function macroEnergy(n: Pick<Nutrients, "protein" | "carbs" | "fat">) {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

// ---------------------------------------------------------------------------
// Targets

export function targetBounds(t: Target): { lo: number; hi: number } {
  switch (t.mode) {
    case "min": return { lo: t.value, hi: Infinity };
    case "max": return { lo: 0, hi: t.value };
    case "range": return { lo: t.min ?? 0, hi: t.max ?? Infinity };
    case "exact": {
      // "Exact" allows a small tolerance: 5% or 3 g/30 kcal, whichever is larger.
      const tol = Math.max(t.value * 0.05, t.value > 300 ? 30 : 3);
      return { lo: t.value - tol, hi: t.value + tol };
    }
  }
}

export function targetLabel(t: Target, unit: string) {
  switch (t.mode) {
    case "min": return `at least ${fmt(t.value)} ${unit}`;
    case "max": return `at most ${fmt(t.value)} ${unit}`;
    case "range": return `${fmt(t.min ?? 0)}–${fmt(t.max ?? 0)} ${unit}`;
    case "exact": return `${fmt(t.value)} ${unit}`;
  }
}

export function targetReference(t: Target) {
  return t.mode === "range" ? ((t.min ?? 0) + (t.max ?? t.min ?? 0)) / 2 : t.value;
}

export type Compliance = "met" | "under" | "over";
/** Rounding slack shared with the optimizer: 1 g, or 10 kcal for energy-scale targets. */
export function slackFor(t: Target) {
  return targetReference(t) > 300 ? 10 : 1;
}

export function compliance(value: number, t: Target): Compliance {
  const { lo, hi } = targetBounds(t);
  const s = slackFor(t);
  if (value < lo - s) return "under";
  if (value > hi + s) return "over";
  return "met";
}

export const MACROS: { key: "kcal" | "protein" | "carbs" | "fat"; label: string; unit: string }[] = [
  { key: "kcal", label: "Energy", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbohydrate", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

export function dayCompliance(n: Nutrients, targets: Targets) {
  return MACROS.map((m) => ({ ...m, value: n[m.key], status: compliance(n[m.key], targets[m.key]) }));
}

export function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
