import { getFood, NUTRIENT_KEYS } from "./foods";
import { getIngredient } from "./ingredients";
import type { NutrientKey, Nutrients, PriceEntry, Recipe, RecipeIngredient } from "@/lib/types";
import { macroEnergy } from "./targets";
export * from "./targets";

export const zero = (): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Nutrients;

export function add(a: Nutrients, b: Partial<Nutrients>, factor = 1): Nutrients {
  const out = { ...a };
  for (const k of NUTRIENT_KEYS) out[k] += (b[k] ?? 0) * factor;
  return out;
}

export function scale(a: Nutrients, f: number): Nutrients {
  const out = { ...a };
  for (const k of NUTRIENT_KEYS) out[k] *= f;
  return out;
}

export interface NutritionResult {
  total: Nutrients;
  /** Ingredient ids whose source record lacks a value for a nutrient, by nutrient. */
  uncertain: Partial<Record<NutrientKey, string[]>>;
  unknownIngredients: string[];
  rawWeight: number;
  cookedWeight: number;
}

/** Nutrition for a list of ingredient quantities, computed from per-100 g database values. */
export function nutritionFor(items: RecipeIngredient[]): NutritionResult {
  let total = zero();
  const uncertain: NutritionResult["uncertain"] = {};
  const unknownIngredients: string[] = [];
  let rawWeight = 0;
  let cookedWeight = 0;
  for (const it of items) {
    const ing = getIngredient(it.ingredientId);
    const food = ing ? getFood(ing.ndb) : undefined;
    if (!ing || !food) {
      unknownIngredients.push(it.ingredientId);
      continue;
    }
    total = add(total, food.per100g, it.grams / 100);
    for (const k of Object.keys(food.missing) as NutrientKey[]) {
      if (it.grams > 0) (uncertain[k] ??= []).push(it.ingredientId);
    }
    rawWeight += it.grams;
    cookedWeight += it.grams * (ing.yieldFactor ?? 1);
  }
  return { total, uncertain, unknownIngredients, rawWeight, cookedWeight };
}

export interface RecipeNutrition extends NutritionResult {
  perServing: Nutrients;
  portionWeight: number; // cooked grams per serving
}

const cache = new Map<string, RecipeNutrition>();
export function recipeNutrition(recipe: Recipe): RecipeNutrition {
  const key = recipe.id + JSON.stringify(recipe.ingredients) + recipe.servings;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = nutritionFor(recipe.ingredients);
  const res: RecipeNutrition = {
    ...r,
    perServing: scale(r.total, 1 / recipe.servings),
    portionWeight: r.cookedWeight / recipe.servings,
  };
  cache.set(key, res);
  return res;
}

/** Scale a recipe's ingredient list to a new serving count. */
export function scaleIngredients(recipe: Recipe, servings: number): RecipeIngredient[] {
  const f = servings / recipe.servings;
  return recipe.ingredients.map((i) => ({ ...i, grams: i.grams * f }));
}

/**
 * Compare database energy with 4/4/9 macro energy. Database energy uses food-specific
 * Atwater factors, so differences of up to ~8% are expected and legitimate.
 */
export function energyCheck(n: Nutrients) {
  const m = macroEnergy(n);
  const diff = n.kcal === 0 ? 0 : (n.kcal - m) / n.kcal;
  return { macroKcal: m, diffPct: diff * 100, ok: Math.abs(diff) <= 0.1 };
}

export function netCarbs(n: Nutrients) {
  return Math.max(0, n.carbs - n.fiber);
}

export interface CostResult {
  total: number;
  currency: string;
  priced: number; // number of ingredients with a price
  unpriced: string[];
  kinds: Set<PriceEntry["kind"]>;
}

export function costFor(items: RecipeIngredient[], prices: Map<string, PriceEntry>, currency: string, staples: (id: string) => boolean): CostResult {
  let total = 0;
  const unpriced: string[] = [];
  const kinds = new Set<PriceEntry["kind"]>();
  let priced = 0;
  for (const it of items) {
    if (staples(it.ingredientId)) continue;
    const p = prices.get(it.ingredientId);
    if (!p || p.currency !== currency) { unpriced.push(it.ingredientId); continue; }
    total += (p.perKg * it.grams) / 1000;
    kinds.add(p.kind);
    priced++;
  }
  return { total, currency, priced, unpriced, kinds };
}

