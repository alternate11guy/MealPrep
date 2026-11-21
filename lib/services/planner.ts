// Meal-plan optimisation service. Pure functions: callers pass in recipes, history and context.
//
// Proposal: candidates are chosen per slot (by the engine, or by Claude when an API key is set).
// Validation: every day is re-solved by the deterministic optimiser against the person's
// targets using actual ingredient quantities; nothing an AI says about nutrition is trusted.

import { recipeNutrition, costFor, MACROS, targetBounds, fmt } from "@/lib/nutrition/compute";
import { getIngredient, isStaple } from "@/lib/nutrition/ingredients";
import { optimizeDay, violationScore, type OptMeal, type OptResult } from "@/lib/nutrition/optimizer";
import { rng, uid, weekDates, daysBetween } from "@/lib/util";
import type {
  Feedback, GenerateOptions, InventoryItem, MealSlot, Nutrients, PlanDay, PlannedMeal, PriceEntry,
  Profile, Recipe, Targets, WeekPlan,
} from "@/lib/types";

export function slotsFor(mealsPerDay: number, supplements: boolean): MealSlot[] {
  switch (Math.max(2, Math.min(6, mealsPerDay))) {
    case 2: return ["lunch", "dinner"];
    case 3: return ["breakfast", "lunch", "dinner"];
    case 4: return ["breakfast", "lunch", "dinner", "snack"];
    case 5: return supplements ? ["breakfast", "lunch", "snack", "dinner", "supplement"] : ["breakfast", "snack", "lunch", "snack", "dinner"];
    default: return supplements ? ["breakfast", "snack", "lunch", "snack", "dinner", "supplement"] : ["breakfast", "snack", "lunch", "snack", "dinner", "snack"];
  }
}

export const SERVING_BOUNDS: Record<MealSlot, [number, number]> = {
  breakfast: [0.6, 1.8], lunch: [0.6, 1.8], dinner: [0.6, 1.8], snack: [0.5, 1.5], supplement: [0.5, 1.5],
};

export interface PlanContext {
  recipes: Recipe[];
  feedback: Feedback[];
  inventory: InventoryItem[];
  prices: PriceEntry[];
  profile: Profile;
  today: string;
  recentRecipeCounts?: Record<string, number>; // from previous weeks
  /** Recipe ids proposed by Claude per slot, used as preferred candidates. */
  proposals?: Partial<Record<MealSlot, string[]>>;
}

export interface DayDiagnosis {
  date: string;
  result: OptResult;
  messages: string[];
  suggestions: string[];
}

export function usesSupplements(r: Recipe) {
  return r.ingredients.some((i) => getIngredient(i.ingredientId)?.aisle === "supplements");
}

function matchesWords(r: Recipe, words: string[]) {
  if (!words.length) return false;
  const hay = r.ingredients.map((i) => (getIngredient(i.ingredientId)?.name ?? i.ingredientId).toLowerCase()).join(" | ") + " " + r.title.toLowerCase();
  return words.some((w) => w && hay.includes(w.toLowerCase()));
}

export function eligibleRecipes(recipes: Recipe[], opts: Pick<GenerateOptions, "exclude" | "maxPrepMin" | "supplements">, profile: Profile, feedback: Feedback[]) {
  const banned = new Set(feedback.filter((f) => f.tags.includes("never") || f.tags.includes("disliked")).map((f) => f.recipeId));
  const avoidWords = [...profile.allergies, ...profile.dislikes].map((s) => s.trim()).filter(Boolean);
  return recipes.filter((r) => {
    if (banned.has(r.id)) return false;
    if (r.ingredients.some((i) => opts.exclude.includes(i.ingredientId))) return false;
    if (matchesWords(r, avoidWords)) return false;
    if (!opts.supplements && usesSupplements(r)) return false;
    if (opts.maxPrepMin && r.prepMin + r.cookMin > opts.maxPrepMin && !r.mealPrep) return false;
    if (opts.maxPrepMin && r.prepMin > opts.maxPrepMin) return false;
    return true;
  });
}

function mealsToOpt(meals: { key: string; recipe: Recipe; slot: MealSlot; fixed?: number }[]): OptMeal[] {
  return meals.map((m) => ({
    key: m.key,
    per: recipeNutrition(m.recipe).perServing,
    lo: SERVING_BOUNDS[m.slot][0],
    hi: SERVING_BOUNDS[m.slot][1],
    fixed: m.fixed,
  }));
}

/** Expiring inventory boosts recipes that use those ingredients (prioritise before they spoil). */
function expiryBoost(r: Recipe, inventory: InventoryItem[], today: string) {
  let b = 0;
  for (const it of inventory) {
    if (!it.ingredientId || !it.expires || it.grams <= 0) continue;
    const d = daysBetween(today, it.expires);
    if (d > 5) continue;
    if (r.ingredients.some((i) => i.ingredientId === it.ingredientId)) b += d <= 2 ? 3 : 1.5;
  }
  return b;
}

function feedbackScore(r: Recipe, feedback: Feedback[]) {
  const f = feedback.find((x) => x.recipeId === r.id);
  if (!f) return 0;
  let s = 0;
  if (f.tags.includes("loved")) s += 2;
  if (f.tags.includes("again")) s += 1;
  if (f.favorite) s += 1;
  if (f.tags.includes("difficult")) s -= 1.5;
  if (f.tags.includes("expensive")) s -= 1;
  if (f.rating) s += (f.rating - 3) * 0.5;
  return s;
}

export interface GenerateResult {
  plan: WeekPlan;
  diagnoses: DayDiagnosis[];
  weeklyCost: { total: number; currency: string; coverage: number };
  notes: string[];
}

export function generateWeek(weekId: string, options: GenerateOptions, ctx: PlanContext, existing?: WeekPlan): GenerateResult {
  const random = rng(options.seed ?? Date.now());
  const dates = weekDates(weekId);
  const slots = options.slots.length ? options.slots : slotsFor(options.mealsPerDay, options.supplements);
  const pool = eligibleRecipes(ctx.recipes, options, ctx.profile, ctx.feedback);
  const priceMap = new Map(ctx.prices.map((p) => [p.ingredientId, p]));
  const currency = ctx.profile.currency;
  const notes: string[] = [];

  const bySlot = new Map<MealSlot, Recipe[]>();
  for (const sl of new Set(slots)) {
    let c = pool.filter((r) => r.slots.includes(sl));
    const proposed = ctx.proposals?.[sl];
    if (proposed?.length) {
      const pr = c.filter((r) => proposed.includes(r.id));
      if (pr.length >= 2) c = pr.concat(c.filter((r) => !proposed.includes(r.id)).slice(0, 2));
    }
    bySlot.set(sl, c);
    if (!c.length) notes.push(`No eligible recipes for ${sl}; that slot is left empty. Loosen exclusions or add recipes.`);
  }

  // Max uses per recipe across the week. Batch-cooked recipes can repeat within fridge life.
  const maxUses = (r: Recipe) => (options.allowRepeats ? (r.mealPrep ? Math.max(3, Math.min(r.servings, 4)) : 3) : 1);
  const relaxed = new Set<MealSlot>();
  const uses = new Map<string, number>();
  const usedOnDay = new Map<string, number[]>();
  const weekIngredients = new Set<string>();

  const cuisinePref = new Set(options.cuisines.map((c) => c.toLowerCase()));
  const available = new Set(options.available);
  const perMealBudget = options.weeklyBudget ? options.weeklyBudget / (7 * slots.length) : undefined;

  const days: PlanDay[] = [];
  const diagnoses: DayDiagnosis[] = [];

  for (let d = 0; d < 7; d++) {
    const date = dates[d];
    const existingDay = existing?.days.find((x) => x.date === date);
    // Past days are history and stay as they are. Locked, eaten and prepared meals are kept.
    const past = Boolean(ctx.today && date < ctx.today && existingDay?.meals.length);
    const locked = existingDay?.meals.filter((m) => past || m.locked || m.status === "eaten" || m.status === "prepared") ?? [];
    const lockedSlots = [...locked.map((m) => m.slot)];
    const openSlots: MealSlot[] = [];
    if (!past) {
      const remaining = [...lockedSlots];
      for (const sl of slots) {
        const idx = remaining.indexOf(sl);
        if (idx >= 0) remaining.splice(idx, 1);
        else openSlots.push(sl);
      }
    }

    const lockedMeals = locked
      .map((m) => ({ m, recipe: ctx.recipes.find((r) => r.id === m.recipeId) }))
      .filter((x): x is { m: PlannedMeal; recipe: Recipe } => Boolean(x.recipe));

    let best: { combo: Recipe[]; result: OptResult; score: number } | null = null;
    const tries = openSlots.length === 0 ? 1 : 260;
    for (let t = 0; t < tries; t++) {
      const combo: Recipe[] = [];
      let ok = true;
      for (const sl of openSlots) {
        let cands = (bySlot.get(sl) ?? []).filter((r) => (uses.get(r.id) ?? 0) < maxUses(r) && !combo.includes(r));
        if (!cands.length) {
          // Not enough distinct recipes: fall back to repeating, and say so.
          cands = (bySlot.get(sl) ?? []).filter((r) => !combo.includes(r));
          relaxed.add(sl);
        }
        if (!cands.length) { ok = false; break; }
        combo.push(cands[Math.floor(random() * cands.length)]);
      }
      if (!ok) continue;
      const optMeals = mealsToOpt([
        ...lockedMeals.map(({ m, recipe }) => ({ key: m.id, recipe, slot: m.slot, fixed: m.servings })),
        ...combo.map((r, i) => ({ key: `n${i}`, recipe: r, slot: openSlots[i] })),
      ]);
      const result = optimizeDay(optMeals, options.targets);
      let score = violationScore(result) * 40;
      combo.forEach((r, i) => {
        const prevDays = usedOnDay.get(r.id) ?? [];
        const lastDay = prevDays.length ? prevDays[prevDays.length - 1] : -10;
        // Batch reuse is good within ~3 days of the cook; repeats on adjacent days are fine
        // for prepped lunches/dinners but variety still matters.
        if (prevDays.length) score += r.mealPrep && d - prevDays[0] <= 3 ? 0.6 : 2.5;
        if (lastDay === d - 1 && !r.mealPrep) score += 2;
        score += (ctx.recentRecipeCounts?.[r.id] ?? 0) * 0.4;
        score -= feedbackScore(r, ctx.feedback);
        score -= expiryBoost(r, ctx.inventory, ctx.today);
        if (cuisinePref.size && cuisinePref.has(r.cuisine.toLowerCase())) score -= 1.2;
        const reuse = r.ingredients.filter((ing) => weekIngredients.has(ing.ingredientId) && !isStaple(ing.ingredientId)).length;
        score -= Math.min(reuse, 5) * 0.15;
        const have = r.ingredients.filter((ing) => available.has(ing.ingredientId)).length;
        score -= have * 0.3;
        const sv = result.servings[`n${i}`] ?? 1;
        if (perMealBudget) {
          const c = costFor(r.ingredients.map((x) => ({ ...x, grams: (x.grams * sv) / r.servings })), priceMap, currency, isStaple);
          if (c.total > perMealBudget) score += ((c.total - perMealBudget) / perMealBudget) * 3;
        }
        if (options.maxPrepMin && r.prepMin + r.cookMin > options.maxPrepMin) score += 0.8;
        score += Math.abs(sv - 1) * 0.6; // prefer portions close to the recipe's serving
      });
      score += random() * 0.05;
      if (!best || score < best.score) best = { combo, result, score };
    }

    const meals: PlannedMeal[] = past ? existingDay!.meals.map((m) => ({ ...m })) : lockedMeals.map(({ m }) => ({ ...m }));
    for (const { recipe } of lockedMeals) {
      uses.set(recipe.id, (uses.get(recipe.id) ?? 0) + 1);
      usedOnDay.set(recipe.id, [...(usedOnDay.get(recipe.id) ?? []), d]);
    }
    if (best) {
      best.combo.forEach((r, i) => {
        meals.push({ id: uid("m"), slot: openSlots[i], recipeId: r.id, servings: best!.result.servings[`n${i}`] ?? 1, locked: false, status: "planned" });
        uses.set(r.id, (uses.get(r.id) ?? 0) + 1);
        usedOnDay.set(r.id, [...(usedOnDay.get(r.id) ?? []), d]);
        r.ingredients.forEach((ing) => weekIngredients.add(ing.ingredientId));
      });
    }
    const order: MealSlot[] = ["breakfast", "snack", "lunch", "dinner", "supplement"];
    meals.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
    days.push({ date, meals });
    const verify = validateDay({ date, meals }, ctx.recipes, options.targets);
    diagnoses.push({ ...diagnose(verify, options.targets, { supplements: options.supplements, ctx, slots }), date });
  }

  const plan: WeekPlan = {
    id: weekId,
    days,
    status: "draft",
    generatedWith: options,
    proposer: ctx.proposals ? "claude" : "engine",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (relaxed.size) notes.push(`There weren't enough different recipes for ${[...relaxed].join(", ")} to avoid repeats, so some meals appear more often than requested. Add or import recipes to widen the choice.`);
  const weeklyCost = planCost(plan, ctx.recipes, priceMap, currency);
  if (options.weeklyBudget && weeklyCost.total > options.weeklyBudget) {
    notes.push(`Estimated cost ${fmt(weeklyCost.total)} ${currency} is above your ${fmt(options.weeklyBudget)} ${currency} budget. Cheaper proteins (chicken, tilapia, turkey chili, lentil soup) and fewer specialty items will bring it down.`);
  }
  if (weeklyCost.coverage < 0.95) notes.push(`Cost covers ${Math.round(weeklyCost.coverage * 100)}% of ingredients; add prices in Grocery to complete it.`);
  plan.notes = [...notes, ...diagnoses.flatMap((x) => x.messages.map((m) => `${x.date}: ${m}`))];
  return { plan, diagnoses, weeklyCost, notes };
}

export function validateDay(day: PlanDay, recipes: Recipe[], targets: Targets): OptResult {
  const meals = day.meals
    .filter((m) => m.status !== "skipped")
    .map((m) => ({ m, recipe: recipes.find((r) => r.id === m.recipeId) }))
    .filter((x): x is { m: PlannedMeal; recipe: Recipe } => Boolean(x.recipe));
  return optimizeDay(mealsToOpt(meals.map(({ m, recipe }) => ({ key: m.id, recipe, slot: m.slot, fixed: m.servings }))), targets);
}

const NAMES: Record<string, string> = { kcal: "energy", protein: "protein", carbs: "carbohydrate", fat: "fat" };

export function diagnose(r: OptResult, targets: Targets, o: { supplements: boolean; ctx: PlanContext; slots: MealSlot[] }): DayDiagnosis {
  const messages: string[] = [];
  const suggestions: string[] = [];
  if (r.satisfied) return { date: "", result: r, messages, suggestions };
  for (const v of r.violations) {
    const unit = v.key === "kcal" ? "kcal" : "g";
    const dir = v.by < 0 ? "short of" : "over";
    const bound = v.by < 0 ? v.lo : v.hi;
    messages.push(`${MACROS.find((m) => m.key === v.key)!.label} ${fmt(v.value)} ${unit}, ${fmt(Math.abs(v.by))} ${unit} ${dir} the ${fmt(bound)} ${unit} limit.`);
  }
  const vk = new Set(r.violations.map((v) => v.key));
  if (vk.has("protein") && (vk.has("fat") || targets.fat.mode !== "min")) {
    const fb = targetBounds(targets.fat);
    if (r.violations.some((v) => v.key === "protein" && v.by < 0) || vk.has("fat")) {
      suggestions.push(`Protein and fat limits pull against each other with these meals. Leaner swaps (egg whites, shrimp, white fish, nonfat yogurt) help most${o.supplements ? "" : ", and allowing a whey shake would close the gap quickly"}. Raising fat from ${fmt(fb.hi)} g to about ${fmt(fb.hi + 8)} g would also make it feasible.`);
    }
  }
  if (r.violations.some((v) => v.key === "carbs" && v.by > 0)) suggestions.push("Swap a grain or bean-based meal for a cauliflower-rice or salad-based one to cut carbohydrate.");
  if (r.violations.some((v) => v.key === "kcal" && v.by < 0)) suggestions.push("Energy is under target; a larger portion of the main meal or an extra snack will close it.");
  if (r.conflicts.length) {
    const sets = r.conflicts.map((c) => c.map((k) => NAMES[k]).join(" and "));
    messages.push(`No portion sizes can satisfy every target with these meals; relaxing ${sets.join(", or ")} would make the day feasible.`);
  }
  return { date: "", result: r, messages, suggestions };
}

export function planCost(plan: WeekPlan, recipes: Recipe[], priceMap: Map<string, PriceEntry>, currency: string) {
  let total = 0;
  let items = 0;
  let priced = 0;
  for (const day of plan.days)
    for (const m of day.meals) {
      if (m.status === "skipped") continue;
      const r = recipes.find((x) => x.id === m.recipeId);
      if (!r) continue;
      const c = costFor(r.ingredients.map((i) => ({ ...i, grams: (i.grams * m.servings) / r.servings })), priceMap, currency, isStaple);
      total += c.total;
      items += c.priced + c.unpriced.length;
      priced += c.priced;
    }
  return { total, currency, coverage: items ? priced / items : 1 };
}

/** Rank replacements for one meal, re-optimising the rest of the (unlocked) day for each. */
export function suggestReplacements(day: PlanDay, mealId: string, ctx: PlanContext, targets: Targets, opts: { protein?: string; limit?: number } = {}) {
  const meal = day.meals.find((m) => m.id === mealId);
  if (!meal) return [];
  const pool = eligibleRecipes(ctx.recipes, { exclude: [], supplements: ctx.profile.supplements }, ctx.profile, ctx.feedback)
    .filter((r) => r.slots.includes(meal.slot) && r.id !== meal.recipeId)
    .filter((r) => !opts.protein || r.ingredients.some((i) => getIngredient(i.ingredientId)?.protein === opts.protein));
  const others = day.meals.filter((m) => m.id !== mealId && m.status !== "skipped");
  const out = pool.map((r) => {
    const optMeals = mealsToOpt([
      ...others.map((m) => {
        const rec = ctx.recipes.find((x) => x.id === m.recipeId)!;
        const fixed = m.locked || m.status === "eaten" || m.status === "prepared" ? m.servings : undefined;
        return { key: m.id, recipe: rec, slot: m.slot, fixed };
      }).filter((x) => x.recipe),
      { key: "new", recipe: r, slot: meal.slot },
    ]);
    const result = optimizeDay(optMeals, targets);
    const changes = others
      .filter((m) => Math.abs((result.servings[m.id] ?? m.servings) - m.servings) >= 0.05)
      .map((m) => ({ mealId: m.id, recipeId: m.recipeId, from: m.servings, to: result.servings[m.id] }));
    return { recipe: r, servings: result.servings.new, result, changes, score: violationScore(result) - feedbackScore(r, ctx.feedback) * 0.01 };
  });
  return out.sort((a, b) => a.score - b.score).slice(0, opts.limit ?? 8);
}

export function dayTotals(day: PlanDay, recipes: Recipe[], mode: "planned" | "actual"): Nutrients {
  const res = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0, calcium: 0, iron: 0, potassium: 0, vitC: 0, vitD: 0, b12: 0 } as Nutrients;
  for (const m of day.meals) {
    if (m.status === "skipped") continue;
    if (mode === "actual" && m.status !== "eaten") continue;
    const r = recipes.find((x) => x.id === m.recipeId);
    if (!r) continue;
    const per = recipeNutrition(r).perServing;
    const sv = mode === "actual" ? m.eatenServings ?? m.servings : m.servings;
    for (const k of Object.keys(res) as (keyof Nutrients)[]) res[k] += per[k] * sv;
  }
  return res;
}
