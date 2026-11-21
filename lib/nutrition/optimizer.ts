// Deterministic portion optimiser.
//
// Given the meals chosen for a day (each a recipe with a per-serving nutrient vector), find
// serving multipliers within sensible bounds that bring the day's totals inside the target
// bounds. This is a box-constrained convex least-squares problem; we solve it with projected
// gradient descent, then check strict feasibility with a linear program so infeasible
// combinations are reported instead of silently missed.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - package ships without types
import solver from "javascript-lp-solver";
import { targetBounds, targetReference, MACROS } from "./compute";
import type { Nutrients, Targets } from "@/lib/types";

export interface OptMeal {
  key: string;
  per: Nutrients; // per serving
  lo: number;
  hi: number;
  fixed?: number; // locked meals keep their servings
}

export interface OptResult {
  servings: Record<string, number>;
  totals: Nutrients;
  feasible: boolean; // a solution inside every bound exists for these meals
  satisfied: boolean; // the returned solution is inside every bound
  violations: { key: Key; label: string; value: number; lo: number; hi: number; by: number }[];
  conflicts: Key[][];
}

type Key = "kcal" | "protein" | "carbs" | "fat";
const KEYS: Key[] = ["kcal", "protein", "carbs", "fat"];
// Weight by importance: protein first (the person's priority), then fat, carbs, energy.
const WEIGHT: Record<Key, number> = { protein: 3, fat: 2, carbs: 1.5, kcal: 1 };
const SCALE: Record<Key, number> = { protein: 10, fat: 5, carbs: 10, kcal: 100 };

function totalsFor(meals: OptMeal[], x: number[]): Nutrients {
  const t = Object.fromEntries(Object.keys(meals[0]?.per ?? {}).map((k) => [k, 0])) as Nutrients;
  meals.forEach((m, i) => {
    for (const k of Object.keys(t) as (keyof Nutrients)[]) t[k] += m.per[k] * x[i];
  });
  return t;
}

function lpFeasible(meals: OptMeal[], bounds: Record<Key, { lo: number; hi: number }>, skip: Key[] = []) {
  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {};
  for (const k of KEYS) {
    if (skip.includes(k)) continue;
    const b = bounds[k];
    constraints[k] = { min: b.lo, ...(Number.isFinite(b.hi) ? { max: b.hi } : {}) };
  }
  const variables: Record<string, Record<string, number>> = {};
  meals.forEach((m, i) => {
    const v: Record<string, number> = { cost: 0 };
    for (const k of KEYS) v[k] = m.per[k];
    v[`cap${i}`] = 1;
    variables[`x${i}`] = v;
    if (m.fixed != null) constraints[`cap${i}`] = { equal: m.fixed };
    else constraints[`cap${i}`] = { min: m.lo, max: m.hi };
  });
  const res = solver.Solve({ optimize: "cost", opType: "min", constraints, variables });
  return Boolean(res.feasible);
}

export function optimizeDay(meals: OptMeal[], targets: Targets, opts: { round?: number } = {}): OptResult {
  const round = opts.round ?? 0.05;
  const bounds = Object.fromEntries(KEYS.map((k) => [k, targetBounds(targets[k])])) as Record<Key, { lo: number; hi: number }>;
  const ref = Object.fromEntries(KEYS.map((k) => [k, targetReference(targets[k])])) as Record<Key, number>;
  const n = meals.length;
  if (n === 0) {
    const totals = totalsFor([{ key: "", per: { kcal: 0 } as Nutrients, lo: 0, hi: 0 }], [0]);
    return { servings: {}, totals, feasible: false, satisfied: false, violations: [], conflicts: [] };
  }

  const lo = meals.map((m) => m.fixed ?? m.lo);
  const hi = meals.map((m) => m.fixed ?? m.hi);
  let x = meals.map((m) => m.fixed ?? Math.min(m.hi, Math.max(m.lo, 1)));

  // Lipschitz bound for the step size
  let L = 0;
  for (const k of KEYS) {
    const a2 = meals.reduce((s, m) => s + (m.per[k] / SCALE[k]) ** 2, 0);
    L += 2 * WEIGHT[k] * 1.1 * a2;
  }
  const step = L > 0 ? 1 / L : 0;
  const gamma = 0.1; // mild pull toward the reference value inside the band

  for (let it = 0; it < 800; it++) {
    const g = new Array(n).fill(0);
    for (const k of KEYS) {
      const v = meals.reduce((s, m, i) => s + m.per[k] * x[i], 0);
      const { lo: l, hi: h } = bounds[k];
      const d = v < l ? v - l : v > h ? v - h : 0;
      const r = Number.isFinite(ref[k]) ? v - ref[k] : 0;
      const coef = (2 * WEIGHT[k] * (d + gamma * r)) / SCALE[k] ** 2;
      meals.forEach((m, i) => (g[i] += coef * m.per[k]));
    }
    x = x.map((xi, i) => Math.min(hi[i], Math.max(lo[i], xi - step * g[i])));
  }
  x = x.map((xi, i) => (meals[i].fixed != null ? xi : Math.min(hi[i], Math.max(lo[i], Math.round(xi / round) * round))));

  const totals = totalsFor(meals, x);
  // Ignore deviations within rounding tolerance (1 g, or 10 kcal).
  const tol = (k: Key) => (k === "kcal" ? 10 : 1);
  const violations = KEYS.flatMap((k) => {
    const v = totals[k];
    const b = bounds[k];
    if (v < b.lo - tol(k)) return [{ key: k, label: MACROS.find((m) => m.key === k)!.label, value: v, lo: b.lo, hi: b.hi, by: v - b.lo }];
    if (v > b.hi + tol(k)) return [{ key: k, label: MACROS.find((m) => m.key === k)!.label, value: v, lo: b.lo, hi: b.hi, by: v - b.hi }];
    return [];
  });

  const feasible = violations.length === 0 || lpFeasible(meals, bounds);
  const conflicts: Key[][] = [];
  if (!feasible) {
    // Find minimal sets of constraints whose removal restores feasibility (singletons, then pairs).
    for (const k of KEYS) if (lpFeasible(meals, bounds, [k])) conflicts.push([k]);
    if (!conflicts.length) {
      for (let i = 0; i < KEYS.length; i++)
        for (let j = i + 1; j < KEYS.length; j++)
          if (lpFeasible(meals, bounds, [KEYS[i], KEYS[j]])) conflicts.push([KEYS[i], KEYS[j]]);
    }
  }

  return {
    servings: Object.fromEntries(meals.map((m, i) => [m.key, Number(x[i].toFixed(2))])),
    totals,
    feasible,
    satisfied: violations.length === 0,
    violations,
    conflicts,
  };
}

/** Score used by the planner: lower is better (weighted squared bound violation). */
export function violationScore(r: OptResult) {
  return r.violations.reduce((s, v) => s + WEIGHT[v.key] * (v.by / SCALE[v.key]) ** 2, 0);
}
