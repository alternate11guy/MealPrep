import { test } from "node:test";
import assert from "node:assert/strict";
import { getFood, searchFoods } from "@/lib/nutrition/foods";
import { energyCheck, nutritionFor, recipeNutrition, scaleIngredients } from "@/lib/nutrition/compute";
import { getIngredient, INGREDIENTS } from "@/lib/nutrition/ingredients";
import { compliance, targetBounds } from "@/lib/nutrition/targets";
import { assessTargets } from "@/lib/nutrition/energy";
import { HOUSE_RECIPES } from "@/lib/data/recipes";
import { DEFAULT_PROFILE, DEFAULT_TARGETS } from "@/lib/store";

test("SR28 values match the published record for raw chicken breast (NDB 05062)", () => {
  const f = getFood("05062")!;
  assert.equal(f.per100g.kcal, 120);
  assert.equal(f.per100g.protein, 22.5);
  assert.equal(f.per100g.fat, 2.62);
  assert.equal(f.per100g.carbs, 0);
});

test("food search finds sensible matches", () => {
  const r = searchFoods("egg white raw", 5);
  assert.ok(r.some((f) => f.ndb === "01124"));
});

test("every catalog ingredient resolves to a USDA record", () => {
  for (const i of INGREDIENTS) assert.ok(getFood(i.ndb), `${i.id} -> ${i.ndb}`);
  assert.equal(getIngredient("ndb:05062")?.ndb, "05062");
});

test("nutrition scales linearly with weight and tracks cooked weight", () => {
  const n = nutritionFor([{ ingredientId: "chicken-breast", grams: 200 }]);
  assert.equal(Math.round(n.total.kcal), 240);
  assert.ok(n.cookedWeight < n.rawWeight, "chicken loses weight when cooked");
});

test("all house recipes resolve and pass the 4/4/9 energy check", () => {
  for (const r of HOUSE_RECIPES) {
    const n = recipeNutrition(r);
    assert.deepEqual(n.unknownIngredients, [], r.id);
    assert.ok(energyCheck(n.perServing).ok, `${r.id}: ${energyCheck(n.perServing).diffPct.toFixed(1)}%`);
  }
});

test("scaling a recipe scales every ingredient", () => {
  const r = HOUSE_RECIPES[0];
  const s = scaleIngredients(r, r.servings * 2);
  s.forEach((x, i) => assert.equal(x.grams, r.ingredients[i].grams * 2));
});

test("exact targets allow a small tolerance; compliance shares the optimizer's rounding slack", () => {
  const b = targetBounds({ mode: "exact", value: 935 });
  assert.ok(Math.abs(b.lo - 888.25) < 1e-9 && Math.abs(b.hi - 981.75) < 1e-9);
  assert.equal(compliance(18.9, { mode: "exact", value: 15 }), "met"); // 15 + 3 tolerance + 1 g rounding
  assert.equal(compliance(19.5, { mode: "exact", value: 15 }), "over");
  assert.equal(compliance(140, { mode: "min", value: 150 }), "under");
});

test("the default 935 kcal target is flagged but never changed", () => {
  const flags = assessTargets(DEFAULT_TARGETS, { ...DEFAULT_PROFILE, age: 34, sex: "male", heightCm: 178, weightKg: 92 });
  assert.ok(flags.some((f) => /calorie|resting/i.test(f.title)));
  assert.equal(DEFAULT_TARGETS.kcal.value, 935);
});
