import { recipeNutrition } from "./nutrition/compute";
import type { Recipe } from "./types";
import type { RecipeSummary } from "@/components/meal-card";

export function summarize(r: Recipe): RecipeSummary {
  const n = recipeNutrition(r);
  return {
    id: r.id, title: r.title, photo: r.photo, cuisine: r.cuisine, prepMin: r.prepMin, cookMin: r.cookMin,
    per: { kcal: n.perServing.kcal, protein: n.perServing.protein, carbs: n.perServing.carbs, fat: n.perServing.fat, fiber: n.perServing.fiber },
    portionWeight: n.portionWeight,
  };
}

export function summaryMap(recipes: Recipe[]) {
  return Object.fromEntries(recipes.map((r) => [r.id, summarize(r)]));
}
