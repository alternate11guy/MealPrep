import { getIngredient, isStaple } from "@/lib/nutrition/ingredients";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { addDays, daysBetween } from "@/lib/util";
import type { PlannedMeal, PrepStage, PrepState, Recipe, WeekPlan } from "@/lib/types";

// Food-safety basis (USDA FSIS, "Leftovers and Food Safety"): refrigerate cooked food within
// 2 hours and use within 3–4 days; frozen leftovers stay safe indefinitely, best quality 2–6
// months. We plan conservatively with each recipe's own fridge days (3 for seafood and egg
// dishes, 4 for meat and poultry) and thaw frozen meals in the refrigerator.
export const FOOD_SAFETY_SOURCE = {
  label: "USDA FSIS: Leftovers and Food Safety",
  url: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety",
};

export function sessionOffsets(state: PrepState): number[] {
  if (state.sessions === "custom") return [...(state.customDays ?? [-1])].sort((a, b) => a - b);
  if (state.sessions === 1) return [-1];
  if (state.sessions === 2) return [-1, 2];
  return [-1, 1, 3];
}

export const STAGE_LABEL: Record<PrepStage, string> = {
  prepare: "Prepare ingredients",
  "wash-chop": "Wash and chop",
  marinate: "Marinate proteins",
  cook: "Cook",
  sauce: "Sauces and dressings",
  weigh: "Weigh portions",
  assemble: "Assemble meals",
  label: "Label containers",
  store: "Refrigerate or freeze",
};
const STAGE_ORDER: PrepStage[] = ["prepare", "wash-chop", "marinate", "cook", "sauce", "weigh", "assemble", "label", "store"];

export interface PrepMeal {
  meal: PlannedMeal;
  date: string;
  recipe: Recipe;
  daysAfterPrep: number;
  storage: "fridge" | "freezer" | "fresh";
  warning?: string;
  portionWeight: number;
}

export interface PrepSession {
  key: string;
  date: string;
  meals: PrepMeal[];
  batches: { recipe: Recipe; servings: number; meals: PrepMeal[] }[];
  proteins: { protein: string; total: number; parts: { recipe: string; grams: number; group?: string }[] }[];
  chopping: { ingredientId: string; name: string; grams: number; notes: string[] }[];
  steps: { id: string; stage: PrepStage; text: string; recipe: string; timerMin?: number }[];
  equipment: string[];
  prepMin: number;
  cookMin: number;
  containers: number;
}

export function buildPrepSchedule(plan: WeekPlan | null, recipes: Recipe[], state: PrepState) {
  if (!plan) return { sessions: [] as PrepSession[], fresh: [] as PrepMeal[] };
  const offsets = sessionOffsets(state);
  const sessionDates = offsets.map((o) => addDays(plan.id, o));
  const sessions: PrepSession[] = sessionDates.map((date, i) => ({
    key: `${plan.id}:${i}`, date, meals: [], batches: [], proteins: [], chopping: [], steps: [], equipment: [], prepMin: 0, cookMin: 0, containers: 0,
  }));
  const fresh: PrepMeal[] = [];

  for (const day of plan.days) {
    for (const meal of day.meals) {
      if (meal.status === "skipped") continue;
      const recipe = recipes.find((r) => r.id === meal.recipeId);
      if (!recipe) continue;
      const portionWeight = recipeNutrition(recipe).portionWeight * meal.servings;
      let idx = -1;
      for (let i = 0; i < sessionDates.length; i++) if (sessionDates[i] <= day.date) idx = i;
      const base: Omit<PrepMeal, "daysAfterPrep" | "storage"> = { meal, date: day.date, recipe, portionWeight };
      if (!recipe.mealPrep || idx === -1) {
        fresh.push({ ...base, daysAfterPrep: 0, storage: "fresh" });
        continue;
      }
      const s = sessions[idx];
      const daysAfter = daysBetween(s.date, day.date);
      let storage: PrepMeal["storage"] = "fridge";
      let warning: string | undefined;
      if (daysAfter > recipe.storage.fridgeDays) {
        if (recipe.storage.freezerMonths) {
          storage = "freezer";
          warning = `Eaten ${daysAfter} days after cooking, beyond the ${recipe.storage.fridgeDays}-day fridge limit: freeze it, and move it to the fridge to thaw the evening before.`;
        } else {
          fresh.push({ ...base, daysAfterPrep: 0, storage: "fresh", warning: `Doesn't freeze well and would be ${daysAfter} days old, so make it fresh on the day or add a prep session closer to it.` });
          continue;
        }
      }
      s.meals.push({ ...base, daysAfterPrep: daysAfter, storage, warning });
    }
  }

  for (const s of sessions) {
    const byRecipe = new Map<string, PrepSession["batches"][number]>();
    for (const m of s.meals) {
      const b = byRecipe.get(m.recipe.id) ?? { recipe: m.recipe, servings: 0, meals: [] };
      b.servings += m.meal.servings;
      b.meals.push(m);
      byRecipe.set(m.recipe.id, b);
    }
    s.batches = [...byRecipe.values()];
    s.containers = s.meals.length;

    const proteins = new Map<string, PrepSession["proteins"][number]>();
    const chop = new Map<string, PrepSession["chopping"][number]>();
    const equip = new Set<string>();
    for (const b of s.batches) {
      const f = b.servings / b.recipe.servings;
      b.recipe.equipment.forEach((e) => equip.add(e));
      s.prepMin += Math.round(b.recipe.prepMin * (1 + 0.2 * Math.max(0, f - 1)));
      s.cookMin += b.recipe.cookMin;
      for (const ing of b.recipe.ingredients) {
        const meta = getIngredient(ing.ingredientId);
        if (!meta) continue;
        const grams = ing.grams * f;
        if (meta.protein && meta.protein !== "dairy") {
          const p = proteins.get(meta.name) ?? { protein: meta.name, total: 0, parts: [] };
          p.total += grams;
          p.parts.push({ recipe: b.recipe.title, grams, group: ing.group });
          proteins.set(meta.name, p);
        } else if ((meta.aisle === "vegetables" || meta.aisle === "herbs") && !isStaple(meta.id)) {
          const c = chop.get(meta.id) ?? { ingredientId: meta.id, name: meta.name, grams: 0, notes: [] };
          c.grams += grams;
          if (ing.note && !c.notes.includes(ing.note)) c.notes.push(ing.note);
          chop.set(meta.id, c);
        }
      }
    }
    s.proteins = [...proteins.values()].sort((a, b) => b.total - a.total);
    s.chopping = [...chop.values()].sort((a, b) => b.grams - a.grams);
    s.equipment = [...equip].sort();

    // Cooking sequence: consolidated chopping first, then each recipe's steps by stage.
    const steps: PrepSession["steps"] = [];
    if (s.chopping.length) {
      steps.push({ id: `${s.key}:chop`, stage: "wash-chop", recipe: "All recipes", text: "Wash and prepare: " + s.chopping.map((c) => `${c.name} ${Math.round(c.grams)} g${c.notes.length ? ` (${c.notes.join(", ")})` : ""}`).join("; ") + "." });
    }
    for (const p of s.proteins.filter((p) => p.parts.length > 1)) {
      steps.push({ id: `${s.key}:split:${p.protein}`, stage: "prepare", recipe: "All recipes", text: `Weigh out ${Math.round(p.total)} g ${p.protein.toLowerCase()} in total, then split it: ${p.parts.map((x) => `${Math.round(x.grams)} g for ${x.recipe}${x.group ? ` (${x.group.toLowerCase()})` : ""}`).join(", ")}. Keep each portion separate so seasonings don't mix.` });
    }
    for (const stage of STAGE_ORDER) {
      for (const b of s.batches) {
        b.recipe.steps.forEach((st, i) => {
          if ((st.stage ?? "cook") !== stage) return;
          if (stage === "wash-chop" && s.chopping.length) return; // consolidated above
          steps.push({ id: `${s.key}:${b.recipe.id}:${i}`, stage, recipe: b.recipe.title, text: st.text, timerMin: st.timerMin });
        });
      }
    }
    steps.push({ id: `${s.key}:weigh`, stage: "weigh", recipe: "All recipes", text: `Weigh ${s.meals.length} portions into containers using the portion weights on each label.` });
    steps.push({ id: `${s.key}:label`, stage: "label", recipe: "All recipes", text: "Print or write labels and attach one to every container." });
    const frozen = s.meals.filter((m) => m.storage === "freezer").length;
    steps.push({ id: `${s.key}:store`, stage: "store", recipe: "All recipes", text: `Cool within 2 hours. Refrigerate ${s.meals.length - frozen} containers${frozen ? ` and freeze ${frozen}` : ""}.` });
    steps.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
    s.steps = steps;
  }
  return { sessions: sessions.filter((s) => s.meals.length), fresh };
}
