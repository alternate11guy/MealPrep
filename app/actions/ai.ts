"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { assertAuth } from "@/lib/auth";
import { putDoc } from "@/lib/db";
import { aiAvailable, analyzeMealPhoto, assistantTurn, discoverRecipes, extractReceipt, mapIngredientLines, modifyRecipe, parseMealText } from "@/lib/services/ai";
import { fetchRecipeFromUrl, heuristicMap, toRecipe } from "@/lib/services/discovery";
import { allRecipes, getInventory, getLogs, getProfile, getRecipe, getTargets, getWeek, TIMEZONE } from "@/lib/store";
import { recipeNutrition, targetLabel } from "@/lib/nutrition/compute";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { searchFoods, prettyDescription } from "@/lib/nutrition/foods";
import { dayTotals } from "@/lib/services/planner";
import { logTotals } from "@/lib/services/analytics";
import { addDays, mondayOf, todayISO, uid } from "@/lib/util";
import type { MealSlot, Recipe } from "@/lib/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    await assertAuth();
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function aiStatusAction() {
  await assertAuth();
  return { ai: aiAvailable() };
}

export async function discoverAction(query: string) {
  return wrap(async () => discoverRecipes(z.string().min(3).max(300).parse(query)));
}

export async function previewImportAction(url: string) {
  return wrap(async () => {
    const src = await fetchRecipeFromUrl(z.string().url().parse(url));
    const mapped = aiAvailable() ? await mapIngredientLines(src.ingredientLines, src.servings) : heuristicMap(src.ingredientLines);
    return { src, mapped, usedAi: aiAvailable() };
  });
}

export async function saveImportAction(url: string, mapped: { line: string; ingredientId: string | null; grams: number | null; confidence: "high" | "low" | "none" }[], slots: MealSlot[]) {
  return wrap(async () => {
    const src = await fetchRecipeFromUrl(z.string().url().parse(url));
    const recipe = toRecipe(src, mapped.filter((m) => !m.ingredientId || getIngredient(m.ingredientId)), { slots: slots.length ? slots : undefined });
    if (!recipe.ingredients.length) throw new Error("None of the ingredients could be matched, so nutrition can't be calculated.");
    await putDoc("recipe", recipe.id, recipe);
    revalidatePath("/", "layout");
    return recipe.id;
  });
}

export async function modifyRecipeAction(recipeId: string, instruction: string) {
  return wrap(async () => {
    const r = await getRecipe(recipeId);
    if (!r) throw new Error("Recipe not found");
    const m = await modifyRecipe(r, z.string().min(3).max(500).parse(instruction));
    if (!m.ingredients.length) throw new Error("The suggested version had no usable ingredients.");
    const copy: Recipe = {
      ...r,
      id: uid("mod"),
      title: m.title,
      ingredients: m.ingredients,
      steps: m.steps.map((t) => ({ text: t })),
      source: { kind: "modified", name: "Adapted with Claude", parentId: r.source.parentId ?? r.id, url: r.source.url, modificationSummary: m.summary },
      photo: r.photo,
    };
    await putDoc("recipe", copy.id, copy);
    revalidatePath("/", "layout");
    return { id: copy.id, summary: m.summary, dropped: m.dropped };
  });
}

export async function parseMealTextAction(text: string) {
  return wrap(async () => parseMealText(z.string().min(2).max(1000).parse(text)));
}

const imageSchema = z.object({ data: z.string().max(14_000_000), type: z.enum(["image/jpeg", "image/png", "image/webp"]) });
export async function analyzePhotoAction(img: { data: string; type: string }, hint?: string) {
  return wrap(async () => {
    const i = imageSchema.parse(img);
    return analyzeMealPhoto(i.data, i.type, hint?.slice(0, 300));
  });
}

export async function receiptAction(img: { data: string; type: string }) {
  return wrap(async () => {
    const i = imageSchema.parse(img);
    return extractReceipt(i.data, i.type);
  });
}

export async function barcodeAction(code: string) {
  return wrap(async () => {
    const c = z.string().regex(/^\d{8,14}$/).parse(code);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,brands,nutriments,serving_size`, {
      headers: { "User-Agent": "MiseMealPlanner/1.0 (personal use)" }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error("Open Food Facts didn't respond.");
    const j = await res.json();
    if (j.status !== 1 || !j.product) throw new Error("This barcode isn't in Open Food Facts yet. Enter the label values manually.");
    const n = j.product.nutriments ?? {};
    const num = (k: string) => (typeof n[k] === "number" ? n[k] : n[k] ? Number(n[k]) : undefined);
    const per100g = {
      kcal: num("energy-kcal_100g") ?? (num("energy_100g") ? num("energy_100g")! / 4.184 : undefined),
      protein: num("proteins_100g"), carbs: num("carbohydrates_100g"), fat: num("fat_100g"),
      fiber: num("fiber_100g"), sugar: num("sugars_100g"), satFat: num("saturated-fat_100g"),
      sodium: num("sodium_100g") != null ? num("sodium_100g")! * 1000 : undefined,
    };
    return { name: [j.product.brands, j.product.product_name].filter(Boolean).join(" · ") || "Scanned product", servingSize: j.product.serving_size as string | undefined, per100g, source: "Open Food Facts (crowd-sourced label data)" };
  });
}

export async function assistantAction(history: { role: "user" | "assistant"; content: string }[]) {
  return wrap(async () => {
    const msgs = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(40).parse(history);
    const today = todayISO(TIMEZONE);
    const monday = mondayOf(today);
    const [recipes, targets, profile, week, nextWeek, prevWeek, inventory, logs] = await Promise.all([
      allRecipes(), getTargets(), getProfile(), getWeek(monday), getWeek(addDays(monday, 7)), getWeek(addDays(monday, -7)), getInventory(), getLogs(),
    ]);
    const title = (id: string) => recipes.find((r) => r.id === id)?.title ?? id;
    const weekText = (w: typeof week, label: string) => !w ? `${label}: no plan.` : `${label} (starts ${w.id}, ${w.status}):\n` + w.days.map((d) => {
      const t = dayTotals(d, recipes, "planned");
      return `${d.date}: ` + d.meals.map((m) => `[${m.id}] ${m.slot} ${title(m.recipeId)} x${m.servings} (${m.status}${m.locked ? ", locked" : ""})`).join("; ") + ` | planned ${Math.round(t.kcal)} kcal P${Math.round(t.protein)} C${Math.round(t.carbs)} F${Math.round(t.fat)}`;
    }).join("\n");
    const todayDay = week?.days.find((d) => d.date === today);
    const eaten = todayDay ? dayTotals(todayDay, recipes, "actual") : null;
    const todayLogs = logs.filter((l) => l.date === today);
    const logged = todayLogs.reduce((s, l) => { const t = logTotals(l); return { kcal: s.kcal + t.kcal, protein: s.protein + t.protein, carbs: s.carbs + t.carbs, fat: s.fat + t.fat }; }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    const lib = recipes.map((r) => { const n = recipeNutrition(r).perServing; return `${r.id} | ${r.title} | ${r.cuisine} | ${r.slots.join("/")} | ${Math.round(n.kcal)} kcal P${Math.round(n.protein)} C${Math.round(n.carbs)} F${Math.round(n.fat)} per serving | ${r.prepMin + r.cookMin} min | source: ${r.source.kind === "web" ? r.source.name : r.source.kind}`; }).join("\n");
    const contextBlock = [
      `Today: ${today} (timezone ${TIMEZONE}). Currency ${profile.currency}.`,
      `Targets: energy ${targetLabel(targets.kcal, "kcal")}, protein ${targetLabel(targets.protein, "g")}, carbohydrate ${targetLabel(targets.carbs, "g")}, fat ${targetLabel(targets.fat, "g")}.`,
      `Profile: goal ${profile.goal}, ${profile.mealsPerDay} meals/day, supplements ${profile.supplements ? "allowed" : "not allowed"}, diet ${profile.diet.join(", ") || "none"}, allergies ${profile.allergies.join(", ") || "none"}, dislikes ${profile.dislikes.join(", ") || "none"}.`,
      `Eaten today from plan: ${eaten ? `${Math.round(eaten.kcal)} kcal P${Math.round(eaten.protein)} C${Math.round(eaten.carbs)} F${Math.round(eaten.fat)}` : "nothing"}. Logged outside plan today: ${todayLogs.length ? `${todayLogs.map((l) => l.name).join(", ")} = ${Math.round(logged.kcal)} kcal P${Math.round(logged.protein)} C${Math.round(logged.carbs)} F${Math.round(logged.fat)}` : "nothing"}.`,
      weekText(week, "This week"), weekText(nextWeek, "Next week"), weekText(prevWeek, "Last week"),
      `Inventory: ${inventory.map((i) => `${i.name} ${Math.round(i.grams)} g (${i.location}${i.expires ? `, expires ${i.expires}` : ""})`).join("; ") || "empty"}`,
      `Recipe library (id | title | cuisine | slots | per serving | time | source):\n${lib}`,
    ].join("\n\n");
    const history2: Anthropic.MessageParam[] = msgs.map((m) => ({ role: m.role, content: m.content }));
    const out = await assistantTurn(history2, contextBlock);
    // Attach USDA-calculated previews to log proposals so nothing shown is AI-estimated nutrition.
    const actions = out.actions.map((a) => {
      if (a.type !== "log_food" || !a.foods) return { ...a, preview: null };
      const items = a.foods.map((f) => { const m = searchFoods(f.usda_query, 1)[0]; return { name: f.name, grams: f.grams, ndb: m?.ndb, matched: m ? prettyDescription(m.description) : null }; });
      return { ...a, preview: items };
    });
    return { text: out.text, actions, sources: out.sources };
  });
}
