"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAuth } from "@/lib/auth";
import { deleteDoc, getDoc, listDocs, putDoc } from "@/lib/db";
import {
  allRecipes, getFeedback, getInventory, getPrices, getProfile, getTargets, getWeek, listWeeks, saveWeek, TIMEZONE,
} from "@/lib/store";
import { generateWeek, slotsFor, suggestReplacements, validateDay, SERVING_BOUNDS, type PlanContext } from "@/lib/services/planner";
import { optimizeDay } from "@/lib/nutrition/optimizer";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { addDays, daysBetween, mondayOf, todayISO, uid, weekDates } from "@/lib/util";
import type { GenerateOptions, MealSlot, PlannedMeal, WeekPlan } from "@/lib/types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slot = z.enum(["breakfast", "lunch", "dinner", "snack", "supplement"]);
const targetSchema = z.object({ mode: z.enum(["min", "max", "range", "exact"]), value: z.number().min(0).max(10000), min: z.number().min(0).optional(), max: z.number().min(0).optional() });

const optionsSchema = z.object({
  targets: z.object({ kcal: targetSchema, protein: targetSchema, carbs: targetSchema, fat: targetSchema, fiber: targetSchema.optional() }),
  mealsPerDay: z.number().int().min(2).max(6),
  slots: z.array(slot).default([]),
  weeklyBudget: z.number().min(0).optional(),
  available: z.array(z.string()).default([]),
  cuisines: z.array(z.string()).default([]),
  maxPrepMin: z.number().int().min(5).max(240).optional(),
  cookingSessions: z.number().int().min(0).max(7),
  exclude: z.array(z.string()).default([]),
  allowRepeats: z.boolean(),
  supplements: z.boolean(),
  seed: z.number().optional(),
});

async function context(): Promise<PlanContext> {
  const [recipes, feedback, inventory, prices, profile, weeks] = await Promise.all([allRecipes(), getFeedback(), getInventory(), getPrices(), getProfile(), listWeeks()]);
  const today = todayISO(TIMEZONE);
  const recentRecipeCounts: Record<string, number> = {};
  for (const w of weeks.filter((w) => daysBetween(w.id, today) > 0 && daysBetween(w.id, today) <= 28))
    for (const d of w.days) for (const m of d.meals) recentRecipeCounts[m.recipeId] = (recentRecipeCounts[m.recipeId] ?? 0) + 1;
  return { recipes, feedback, inventory, prices, profile, today, recentRecipeCounts };
}

function done() {
  revalidatePath("/", "layout");
}

async function mustWeek(id: string) {
  const w = await getWeek(id);
  if (!w) throw new Error("That week has no plan yet.");
  return w;
}

function findMeal(w: WeekPlan, date: string, mealId: string) {
  const day = w.days.find((d) => d.date === date);
  const meal = day?.meals.find((m) => m.id === mealId);
  if (!day || !meal) throw new Error("Meal not found.");
  return { day, meal };
}

export async function generateWeekAction(weekId: string, raw: unknown) {
  await assertAuth();
  isoDate.parse(weekId);
  const options = optionsSchema.parse(raw) as GenerateOptions;
  options.slots = options.slots.length ? options.slots : slotsFor(options.mealsPerDay, options.supplements);
  options.seed ??= Math.floor(Math.random() * 1e9);
  const ctx = await context();
  const existing = (await getWeek(weekId)) ?? undefined;
  // Claude may propose candidates; the deterministic engine always validates portions.
  try {
    const { proposeCandidates } = await import("@/lib/services/ai");
    const proposals = await proposeCandidates(options, ctx);
    if (proposals) ctx.proposals = proposals;
  } catch {
    // AI unavailable: the engine proposes on its own.
  }
  const res = generateWeek(weekId, options, ctx, existing);
  await saveWeek({ ...res.plan, demo: false, status: existing?.status === "confirmed" ? "draft" : res.plan.status });
  done();
  return {
    notes: res.notes,
    days: res.diagnoses.map((d) => ({ date: d.date, ok: d.result.satisfied, messages: d.messages, suggestions: d.suggestions })),
    cost: res.weeklyCost,
    proposer: res.plan.proposer,
  };
}

export async function regenerateUnlockedAction(weekId: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const profile = await getProfile();
  const targets = await getTargets();
  const opts: GenerateOptions = w.generatedWith ?? {
    targets, mealsPerDay: profile.mealsPerDay, slots: slotsFor(profile.mealsPerDay, profile.supplements), available: [], cuisines: [],
    cookingSessions: 2, exclude: [], allowRepeats: true, supplements: profile.supplements,
  };
  // Eaten and prepared meals stay where they are: lock them for the run, then restore flags.
  const originalLocks = new Map(w.days.flatMap((d) => d.meals.map((m) => [m.id, m.locked] as const)));
  await saveWeek({ ...w, days: w.days.map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, locked: m.locked || m.status === "eaten" || m.status === "prepared" })) })) });
  const r = await generateWeekAction(weekId, { ...opts, targets, seed: Math.floor(Math.random() * 1e9) });
  const fresh = await mustWeek(weekId);
  for (const d of fresh.days) for (const m of d.meals) if (originalLocks.has(m.id)) m.locked = originalLocks.get(m.id)!;
  await saveWeek(fresh);
  done();
  return r;
}

export async function setMealStatusAction(weekId: string, date: string, mealId: string, status: PlannedMeal["status"], eatenServings?: number) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const { meal } = findMeal(w, date, mealId);
  meal.status = status;
  if (status === "eaten") { meal.eatenServings = eatenServings ?? meal.servings; meal.eatenAt = new Date().toISOString(); }
  else { delete meal.eatenServings; delete meal.eatenAt; }
  await saveWeek(w);
  done();
}

export async function setServingsAction(weekId: string, date: string, mealId: string, servings: number) {
  await assertAuth();
  z.number().min(0.1).max(10).parse(servings);
  const w = await mustWeek(weekId);
  const { meal } = findMeal(w, date, mealId);
  meal.servings = Math.round(servings * 100) / 100;
  if (meal.status === "eaten") meal.eatenServings = meal.servings;
  await saveWeek(w);
  done();
}

export async function toggleLockAction(weekId: string, date: string, mealId: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const { meal } = findMeal(w, date, mealId);
  meal.locked = !meal.locked;
  await saveWeek(w);
  done();
}

export async function replacementOptionsAction(weekId: string, date: string, mealId: string, protein?: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const { day } = findMeal(w, date, mealId);
  const ctx = await context();
  const targets = await getTargets();
  return suggestReplacements(day, mealId, ctx, targets, { protein, limit: 10 }).map((s) => ({
    recipeId: s.recipe.id,
    title: s.recipe.title,
    photo: s.recipe.photo,
    cuisine: s.recipe.cuisine,
    servings: s.servings,
    perServing: recipeNutrition(s.recipe).perServing,
    satisfied: s.result.satisfied,
    totals: { kcal: s.result.totals.kcal, protein: s.result.totals.protein, carbs: s.result.totals.carbs, fat: s.result.totals.fat },
    violations: s.result.violations.map((v) => ({ label: v.label, by: v.by, key: v.key })),
    changes: s.changes.map((c) => ({ ...c, title: ctx.recipes.find((r) => r.id === c.recipeId)?.title ?? c.recipeId })),
  }));
}

export async function replaceMealAction(weekId: string, date: string, mealId: string, recipeId: string, servings: number, changes: { mealId: string; to: number }[] = []) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const { day, meal } = findMeal(w, date, mealId);
  meal.recipeId = recipeId;
  meal.servings = servings;
  meal.status = "planned";
  for (const c of changes) {
    const m = day.meals.find((x) => x.id === c.mealId);
    if (m && !m.locked && m.status === "planned") m.servings = c.to;
  }
  await saveWeek(w);
  done();
}

export async function addMealAction(weekId: string, date: string, s: MealSlot, recipeId: string, servings = 1) {
  await assertAuth();
  slot.parse(s);
  let w = await getWeek(weekId);
  if (!w) {
    w = { id: weekId, days: weekDates(weekId).map((d) => ({ date: d, meals: [] })), status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  const day = w.days.find((d) => d.date === date);
  if (!day) throw new Error("Date is not in this week.");
  day.meals.push({ id: uid("m"), slot: s, recipeId, servings, locked: false, status: "planned" });
  await saveWeek(w);
  done();
}

export async function removeMealAction(weekId: string, date: string, mealId: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const day = w.days.find((d) => d.date === date);
  if (day) day.meals = day.meals.filter((m) => m.id !== mealId);
  await saveWeek(w);
  done();
}

export async function moveMealAction(fromWeek: string, fromDate: string, mealId: string, toDate: string, copy: boolean, toSlot?: MealSlot) {
  await assertAuth();
  const w = await mustWeek(fromWeek);
  const { day, meal } = findMeal(w, fromDate, mealId);
  const target = w.days.find((d) => d.date === toDate);
  if (!target) throw new Error("Pick a day in the same week.");
  const moved: PlannedMeal = { ...meal, id: copy ? uid("m") : meal.id, slot: toSlot ?? meal.slot, status: copy ? "planned" : meal.status };
  if (!copy) day.meals = day.meals.filter((m) => m.id !== mealId);
  target.meals.push(moved);
  await saveWeek(w);
  done();
}

export async function copyDayAction(weekId: string, fromDate: string, toDate: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const from = w.days.find((d) => d.date === fromDate);
  const to = w.days.find((d) => d.date === toDate);
  if (!from || !to) throw new Error("Day not found.");
  to.meals = [...to.meals.filter((m) => m.locked || m.status !== "planned"), ...from.meals.map((m) => ({ ...m, id: uid("m"), status: "planned" as const, locked: false, eatenServings: undefined, eatenAt: undefined }))];
  await saveWeek(w);
  done();
}

export async function duplicateWeekAction(fromWeek: string, toWeek: string) {
  await assertAuth();
  isoDate.parse(toWeek);
  const w = await getWeek(fromWeek) ?? await getDoc<WeekPlan>("template", fromWeek);
  if (!w) throw new Error("Source week not found.");
  const target = await getWeek(toWeek);
  if (target && target.days.some((d) => d.meals.some((m) => m.status !== "planned"))) throw new Error("The target week already has eaten or prepared meals; clear them first.");
  const dates = weekDates(toWeek);
  const copy: WeekPlan = {
    id: toWeek, status: "draft", generatedWith: w.generatedWith, proposer: w.proposer,
    days: w.days.map((d, i) => ({ date: dates[i], meals: d.meals.map((m) => ({ ...m, id: uid("m"), status: "planned" as const, eatenServings: undefined, eatenAt: undefined })) })),
    notes: [`Copied from week of ${fromWeek}.`], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await saveWeek(copy);
  done();
}

export async function saveTemplateAction(weekId: string, name: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const id = uid("t");
  await putDoc("template", id, { ...w, id, name: z.string().min(1).max(80).parse(name), status: "draft" });
  done();
  return id;
}

export async function listTemplatesAction() {
  await assertAuth();
  return (await listDocs<WeekPlan & { name: string }>("template")).map((t) => ({ id: t.id, name: t.name, meals: t.days.reduce((s, d) => s + d.meals.length, 0) }));
}

export async function deleteTemplateAction(id: string) {
  await assertAuth();
  await deleteDoc("template", id);
  done();
}

export async function rebalanceDayAction(weekId: string, date: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const day = w.days.find((d) => d.date === date);
  if (!day) throw new Error("Day not found.");
  const [recipes, targets] = await Promise.all([allRecipes(), getTargets()]);
  const active = day.meals.filter((m) => m.status !== "skipped").map((m) => ({ m, r: recipes.find((x) => x.id === m.recipeId)! })).filter((x) => x.r);
  const res = optimizeDay(active.map(({ m, r }) => ({
    key: m.id, per: recipeNutrition(r).perServing, lo: SERVING_BOUNDS[m.slot][0], hi: SERVING_BOUNDS[m.slot][1],
    fixed: m.locked || m.status !== "planned" ? (m.status === "eaten" ? m.eatenServings ?? m.servings : m.servings) : undefined,
  })), targets);
  for (const { m } of active) if (!m.locked && m.status === "planned") m.servings = res.servings[m.id] ?? m.servings;
  await saveWeek(w);
  done();
  return { satisfied: res.satisfied, violations: res.violations.map((v) => `${v.label} ${v.by > 0 ? "over" : "under"} by ${Math.abs(Math.round(v.by))}`) };
}

export async function confirmPlanAction(weekId: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  w.status = "confirmed";
  await saveWeek(w);
  done();
}

export async function dayCheckAction(weekId: string, date: string) {
  await assertAuth();
  const w = await mustWeek(weekId);
  const day = w.days.find((d) => d.date === date)!;
  const r = validateDay(day, await allRecipes(), await getTargets());
  return { satisfied: r.satisfied, violations: r.violations, conflicts: r.conflicts };
}

export async function nextWeekId(weekId: string) {
  return addDays(weekId, 7);
}

/**
 * Weekly proposal: draft next week from the last settings used, marked "proposed".
 * It never replaces an existing plan and changes nothing else until the person confirms it.
 */
export async function proposeNextWeekAction() {
  await assertAuth();
  const today = todayISO(TIMEZONE);
  const thisWeek = mondayOf(today);
  const next = addDays(thisWeek, 7);
  if (await getWeek(next)) throw new Error("Next week already has a plan.");
  const [profile, targets, current] = await Promise.all([getProfile(), getTargets(), getWeek(thisWeek)]);
  const base = current?.generatedWith;
  const options: GenerateOptions = {
    targets,
    mealsPerDay: base?.mealsPerDay ?? profile.mealsPerDay,
    slots: base?.slots ?? slotsFor(profile.mealsPerDay, profile.supplements),
    weeklyBudget: base?.weeklyBudget,
    available: [],
    cuisines: base?.cuisines ?? [],
    maxPrepMin: base?.maxPrepMin,
    cookingSessions: base?.cookingSessions ?? 2,
    exclude: base?.exclude ?? [],
    allowRepeats: base?.allowRepeats ?? true,
    supplements: base?.supplements ?? profile.supplements,
    seed: Math.floor(Math.random() * 1e9),
  };
  const ctx = await context();
  ctx.inventory = ctx.inventory.filter((i) => i.ingredientId);
  options.available = [...new Set(ctx.inventory.map((i) => i.ingredientId!))];
  const res = generateWeek(next, options, ctx, undefined);
  await saveWeek({ ...res.plan, status: "proposed" });
  done();
  return { weekId: next, onTarget: res.diagnoses.filter((d) => d.result.satisfied).length };
}
