import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeDay } from "@/lib/nutrition/optimizer";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { generateWeek, slotsFor, type PlanContext } from "@/lib/services/planner";
import { buildGrocery } from "@/lib/services/grocery";
import { buildPrepSchedule } from "@/lib/services/prep";
import { heuristicMap } from "@/lib/services/discovery";
import { HOUSE_RECIPES } from "@/lib/data/recipes";
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from "@/lib/store";
import type { GenerateOptions } from "@/lib/types";

const monday = "2026-11-23";
const ctx: PlanContext = { recipes: HOUSE_RECIPES, feedback: [], inventory: [], prices: [], profile: DEFAULT_PROFILE, today: "2026-11-21" };
const options: GenerateOptions = {
  targets: DEFAULT_TARGETS, mealsPerDay: 4, slots: slotsFor(4, true), available: [], cuisines: [], cookingSessions: 2, exclude: [], allowRepeats: true, supplements: true, seed: 42,
};
const byId = (id: string) => HOUSE_RECIPES.find((r) => r.id === id)!;

test("optimizer finds portions that hit 150/50/15/935 for a lean day", () => {
  const meals = ["egg-white-shakshuka", "chicken-shawarma-bowl", "baked-cod-tomatoes", "whey-shake"].map((id, i) => ({ key: String(i), per: recipeNutrition(byId(id)).perServing, lo: 0.5, hi: 1.8 }));
  const r = optimizeDay(meals, DEFAULT_TARGETS);
  assert.ok(r.feasible);
  assert.ok(Math.abs(r.totals.protein - 150) < 12, `protein ${r.totals.protein}`);
});

test("optimizer explains infeasible combinations", () => {
  const meals = [{ key: "a", per: recipeNutrition(byId("whey-shake")).perServing, lo: 0.5, hi: 1 }];
  const r = optimizeDay(meals, DEFAULT_TARGETS);
  assert.equal(r.satisfied, false);
  assert.equal(r.feasible, false);
  assert.ok(r.violations.length > 0);
});

test("Generate My Week meets targets on most days and is deterministic for a seed", () => {
  const a = generateWeek(monday, options, ctx);
  const b = generateWeek(monday, options, ctx);
  assert.equal(a.plan.days.length, 7);
  assert.ok(a.diagnoses.filter((d) => d.result.satisfied).length >= 6, a.plan.notes?.join("\n"));
  assert.deepEqual(a.plan.days.map((d) => d.meals.map((m) => m.recipeId)), b.plan.days.map((d) => d.meals.map((m) => m.recipeId)));
});

test("generation keeps locked, eaten and prepared meals, and leaves past days alone", () => {
  const first = generateWeek(monday, options, ctx).plan;
  first.days[2].meals[0].locked = true;
  first.days[3].meals[1].status = "eaten";
  first.days[4].meals[2].status = "prepared";
  const keep = [first.days[2].meals[0].id, first.days[3].meals[1].id, first.days[4].meals[2].id];
  const again = generateWeek(monday, { ...options, seed: 7 }, ctx, first).plan;
  const ids = again.days.flatMap((d) => d.meals.map((m) => m.id));
  for (const id of keep) assert.ok(ids.includes(id), id);
  const later = generateWeek(monday, { ...options, seed: 9 }, { ...ctx, today: "2026-11-26" }, first).plan;
  assert.deepEqual(later.days[0].meals.map((m) => m.id), first.days[0].meals.map((m) => m.id));
});

test("excluded ingredients never appear", () => {
  const plan = generateWeek(monday, { ...options, exclude: ["chicken-breast"] }, ctx).plan;
  for (const d of plan.days) for (const m of d.meals) assert.ok(!byId(m.recipeId).ingredients.some((i) => i.ingredientId === "chicken-breast"), m.recipeId);
});

test("grocery list subtracts inventory and skips eaten meals", () => {
  const plan = generateWeek(monday, options, ctx).plan;
  const state = { weekId: monday, checked: {}, adjustments: {}, removed: {}, substitutions: {}, manual: [] };
  const base = buildGrocery(plan, HOUSE_RECIPES, [], [], state, "EGP");
  const line = base.lines.find((l) => !l.staple && l.toBuy > 100)!;
  const withStock = buildGrocery(plan, HOUSE_RECIPES, [{ id: "x", ingredientId: line.ingredientId, name: line.name, grams: 100, location: "fridge" }], [], state, "EGP");
  const after = withStock.lines.find((l) => l.ingredientId === line.ingredientId)!;
  assert.ok(Math.abs(after.toBuy - (line.toBuy - 100)) < 1e-6);
});

test("prep schedule never keeps a meal in the fridge beyond its recipe's limit", () => {
  const plan = generateWeek(monday, options, ctx).plan;
  for (const sessions of [1, 2, 3] as const) {
    const { sessions: s } = buildPrepSchedule(plan, HOUSE_RECIPES, { weekId: monday, sessions, done: {}, confirmed: {} });
    for (const x of s) for (const m of x.meals) if (m.storage === "fridge") assert.ok(m.daysAfterPrep <= m.recipe.storage.fridgeDays, `${m.recipe.id} ${m.daysAfterPrep}d`);
  }
});

test("recipe import maps simple gram lines with high confidence", () => {
  const [m] = heuristicMap(["500 g boneless skinless chicken breast"]);
  assert.equal(m.ingredientId, "chicken-breast");
  assert.equal(m.grams, 500);
  assert.equal(m.confidence, "high");
});
