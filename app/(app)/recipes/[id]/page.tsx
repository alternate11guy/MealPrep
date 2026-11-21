import { notFound } from "next/navigation";
import { getDoc } from "@/lib/db";
import { allRecipes, getFeedback, getPrices, getProfile, TIMEZONE } from "@/lib/store";
import { getFood, prettyDescription, fdcSearchUrl, SR28_CITATION } from "@/lib/nutrition/foods";
import { getIngredient, isStaple } from "@/lib/nutrition/ingredients";
import { energyCheck, recipeNutrition } from "@/lib/nutrition/compute";
import { mondayOf, todayISO, weekDates } from "@/lib/util";
import { RecipeClient, type IngredientRow } from "./recipe-client";
import type { NutrientKey, Recipe } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = (await allRecipes()).find((x) => x.id === id);
  return { title: r?.title ?? "Recipe" };
}

const KEYS: NutrientKey[] = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "satFat", "sodium", "potassium", "calcium", "iron", "vitC", "vitD", "b12"];

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [recipes, feedback, prices, profile] = await Promise.all([allRecipes(), getFeedback(), getPrices(), getProfile()]);
  const r = recipes.find((x) => x.id === id);
  if (!r) notFound();
  const priceMap = new Map(prices.map((p) => [p.ingredientId, p]));
  const n = recipeNutrition(r);

  const rows: IngredientRow[] = r.ingredients.map((it) => {
    const ing = getIngredient(it.ingredientId);
    const food = ing ? getFood(ing.ndb) : undefined;
    const price = priceMap.get(it.ingredientId);
    const nutrients = Object.fromEntries(KEYS.map((k) => [k, food ? (food.per100g[k] * it.grams) / 100 : 0])) as Record<NutrientKey, number>;
    return {
      id: it.ingredientId,
      name: ing?.name ?? it.ingredientId,
      grams: it.grams,
      note: it.note,
      group: it.group,
      unit: ing?.unit,
      yieldFactor: ing?.yieldFactor,
      yieldBasis: ing?.yieldBasis,
      staple: isStaple(it.ingredientId),
      nutrients,
      missing: food ? (Object.keys(food.missing) as NutrientKey[]) : KEYS,
      known: Boolean(food),
      ndb: ing?.ndb,
      usda: food ? prettyDescription(food.description) : undefined,
      usdaUrl: ing ? fdcSearchUrl(ing.ndb) : undefined,
      price: price && price.currency === profile.currency ? { perKg: price.perKg, kind: price.kind } : undefined,
      labelNote: ing?.labelNote,
    };
  });

  const parent = r.source.parentId ? recipes.find((x) => x.id === r.source.parentId) : undefined;
  const variants = recipes.filter((x) => x.source.parentId === r.id).map((x) => ({ id: x.id, title: x.title, summary: x.source.modificationSummary }));
  const deletable = Boolean(await getDoc<Recipe>("recipe", r.id));
  const fb = feedback.find((f) => f.recipeId === r.id);
  const today = todayISO(TIMEZONE);
  const weekId = mondayOf(today);
  const ec = energyCheck(n.perServing);

  return (
    <RecipeClient
      recipe={{
        id: r.id, title: r.title, description: r.description, photo: r.photo, cuisine: r.cuisine, categories: r.categories, slots: r.slots,
        prepMin: r.prepMin, cookMin: r.cookMin, servings: r.servings, steps: r.steps, equipment: r.equipment, substitutions: r.substitutions,
        storage: r.storage, reheating: r.reheating, mealPrep: r.mealPrep, source: r.source, originalLines: r.originalLines,
      }}
      rows={rows}
      cookedWeight={n.cookedWeight}
      rawWeight={n.rawWeight}
      energy={{ macroKcal: ec.macroKcal / 1, diffPct: ec.diffPct, ok: ec.ok }}
      parent={parent ? { id: parent.id, title: parent.title } : undefined}
      variants={variants}
      deletable={deletable}
      feedback={{ tags: fb?.tags ?? [], rating: fb?.rating, favorite: Boolean(fb?.favorite) }}
      currency={profile.currency}
      weekId={weekId}
      weekDates={weekDates(weekId).filter((d) => d >= today)}
      citation={SR28_CITATION}
    />
  );
}
