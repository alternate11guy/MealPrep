"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAuth, changePasscode, destroySession } from "@/lib/auth";
import { deleteDoc, getDoc, listDocs, putDoc, wipeAll } from "@/lib/db";
import {
  allRecipes, getGrocery, getInventory, getPrep, getPrices, getProfile, getRecipe, getTargets, getWeek, saveProfile, saveTargets, saveWeek, TIMEZONE,
} from "@/lib/store";
import { buildPrepSchedule } from "@/lib/services/prep";
import { buildGrocery } from "@/lib/services/grocery";
import { clearDemo, seedDemo } from "@/lib/services/demo";
import { searchFoods, prettyDescription, getFood } from "@/lib/nutrition/foods";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { addDays, todayISO, uid } from "@/lib/util";
import type {
  Feedback, FeedbackTag, FoodLogEntry, GroceryState, InventoryItem, PrepState, PriceEntry, Profile, Recipe, Targets,
} from "@/lib/types";

const done = () => revalidatePath("/", "layout");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const targetSchema = z.object({ mode: z.enum(["min", "max", "range", "exact"]), value: z.number().min(0).max(10000), min: z.number().min(0).optional(), max: z.number().min(0).optional() });
const targetsSchema = z.object({ kcal: targetSchema, protein: targetSchema, carbs: targetSchema, fat: targetSchema, fiber: targetSchema.optional() });

const profileSchema = z.object({
  name: z.string().max(60).optional(),
  age: z.number().int().min(14).max(110).optional(),
  sex: z.enum(["female", "male"]).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(350).optional(),
  targetWeightKg: z.number().min(30).max(350).optional(),
  activity: z.enum(["sedentary", "light", "moderate", "active", "very-active"]),
  trainingPerWeek: z.number().int().min(0).max(14),
  diet: z.array(z.string().max(40)).max(20),
  allergies: z.array(z.string().max(40)).max(30),
  dislikes: z.array(z.string().max(40)).max(50),
  goal: z.enum(["lose", "maintain", "gain"]),
  mealsPerDay: z.number().int().min(2).max(6),
  clinicianKcal: z.number().int().min(500).max(6000).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  hydration: z.boolean(),
  waterTargetMl: z.number().int().min(500).max(6000),
  supplements: z.boolean(),
  shoppingDay: z.number().int().min(0).max(6),
  weeklyProposal: z.boolean(),
}).partial();

export async function saveOnboardingAction(rawProfile: unknown, rawTargets: unknown, demo: boolean) {
  await assertAuth();
  const p = profileSchema.parse(rawProfile);
  const t = targetsSchema.parse(rawTargets) as Targets;
  const prev = await getProfile();
  await saveProfile({ ...prev, ...p, onboarded: true, demo } as Profile);
  await saveTargets(t);
  if (demo) await seedDemo(todayISO(TIMEZONE));
  done();
  redirect(demo ? "/" : "/plan?generate=1");
}

export async function saveProfileAction(raw: unknown) {
  await assertAuth();
  const p = profileSchema.parse(raw);
  await saveProfile({ ...(await getProfile()), ...p });
  done();
}

export async function saveTargetsAction(raw: unknown) {
  await assertAuth();
  await saveTargets(targetsSchema.parse(raw) as Targets);
  done();
}

// ---------------------------------------------------------------- feedback & recipes

export async function saveFeedbackAction(recipeId: string, patch: { tags?: FeedbackTag[]; rating?: number; favorite?: boolean }) {
  await assertAuth();
  const prev = (await getDoc<Feedback>("feedback", recipeId)) ?? { recipeId, tags: [], updatedAt: "" };
  const next: Feedback = {
    ...prev,
    ...(patch.tags ? { tags: z.array(z.enum(["loved", "again", "difficult", "expensive", "disliked", "never"])).parse(patch.tags) } : {}),
    ...(patch.rating != null ? { rating: z.number().int().min(0).max(5).parse(patch.rating) || undefined } : {}),
    ...(patch.favorite != null ? { favorite: patch.favorite } : {}),
    updatedAt: new Date().toISOString(),
  };
  await putDoc("feedback", recipeId, next);
  done();
}

const recipeSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  description: z.string().max(1200),
  source: z.object({ kind: z.enum(["house", "web", "user", "modified"]), name: z.string(), url: z.string().url().optional(), author: z.string().optional(), retrievedAt: z.string().optional(), parentId: z.string().optional(), modificationSummary: z.string().optional() }),
  photo: z.object({ kind: z.enum(["licensed", "source", "user", "generated", "placeholder"]), url: z.string().optional(), credit: z.string().optional(), license: z.string().optional(), licenseUrl: z.string().optional(), sourceUrl: z.string().optional(), alt: z.string() }),
  cuisine: z.string().max(60),
  categories: z.array(z.string()),
  slots: z.array(z.enum(["breakfast", "lunch", "dinner", "snack", "supplement"])).min(1),
  prepMin: z.number().min(0).max(1440),
  cookMin: z.number().min(0).max(1440),
  servings: z.number().min(1).max(50),
  ingredients: z.array(z.object({ ingredientId: z.string(), grams: z.number().min(0).max(20000), note: z.string().optional(), group: z.string().optional() })).min(1),
  originalLines: z.array(z.string()).optional(),
  steps: z.array(z.object({ text: z.string(), timerMin: z.number().optional(), stage: z.string().optional() })),
  equipment: z.array(z.string()),
  substitutions: z.array(z.object({ from: z.string(), to: z.string(), note: z.string() })),
  storage: z.object({ fridgeDays: z.number(), freezerMonths: z.number().nullable(), note: z.string() }),
  reheating: z.string(),
  mealPrep: z.boolean(),
  tags: z.array(z.string()).optional(),
});

export async function saveRecipeAction(raw: unknown) {
  await assertAuth();
  const r = recipeSchema.parse(raw) as Recipe;
  const unknown = r.ingredients.filter((i) => !getIngredient(i.ingredientId));
  if (unknown.length) throw new Error(`Unknown ingredients: ${unknown.map((u) => u.ingredientId).join(", ")}`);
  await putDoc("recipe", r.id, r);
  done();
  return r.id;
}

export async function deleteRecipeAction(id: string) {
  await assertAuth();
  const r = await getDoc<Recipe>("recipe", id);
  if (!r) throw new Error("Only imported, personal or modified recipes can be deleted.");
  await deleteDoc("recipe", id);
  done();
  redirect("/recipes");
}

export async function duplicateRecipeAction(id: string) {
  await assertAuth();
  const r = await getRecipe(id);
  if (!r) throw new Error("Recipe not found");
  const copy: Recipe = { ...r, id: uid("r"), title: `${r.title} (my version)`, source: { kind: "modified", name: "Personal cookbook", parentId: r.id, modificationSummary: "Copied for editing" } };
  await putDoc("recipe", copy.id, copy);
  done();
  return copy.id;
}

// ---------------------------------------------------------------- grocery & prices

export async function updateGroceryAction(weekId: string, patch: Partial<Omit<GroceryState, "weekId">>) {
  await assertAuth();
  isoDate.parse(weekId);
  const prev = await getGrocery(weekId);
  const next: GroceryState = {
    ...prev,
    checked: { ...prev.checked, ...(patch.checked ?? {}) },
    adjustments: Object.fromEntries(Object.entries({ ...prev.adjustments, ...(patch.adjustments ?? {}) }).filter(([, v]) => v != null && v >= 0)) as Record<string, number>,
    removed: { ...prev.removed, ...(patch.removed ?? {}) },
    substitutions: Object.fromEntries(Object.entries({ ...prev.substitutions, ...(patch.substitutions ?? {}) }).filter(([, v]) => Boolean(v))) as Record<string, string>,
    manual: patch.manual ?? prev.manual,
  };
  await putDoc("grocery", weekId, next);
  done();
}

export async function clearAdjustmentAction(weekId: string, ingredientId: string) {
  await assertAuth();
  const prev = await getGrocery(weekId);
  delete prev.adjustments[ingredientId];
  delete prev.removed[ingredientId];
  delete prev.substitutions[ingredientId];
  await putDoc("grocery", weekId, prev);
  done();
}

export async function setPriceAction(ingredientId: string, perKg: number | null, currency: string, kind: PriceEntry["kind"]) {
  await assertAuth();
  if (!getIngredient(ingredientId)) throw new Error("Unknown ingredient");
  if (perKg == null) { await deleteDoc("price", ingredientId); done(); return; }
  await putDoc<PriceEntry>("price", ingredientId, {
    ingredientId, perKg: z.number().min(0).max(1e7).parse(perKg), currency: z.string().regex(/^[A-Z]{3}$/).parse(currency),
    kind: z.enum(["manual", "estimate", "verified"]).parse(kind), updatedAt: new Date().toISOString(),
  });
  done();
}

// ---------------------------------------------------------------- inventory

const invSchema = z.object({
  id: z.string().optional(),
  ingredientId: z.string().optional(),
  name: z.string().min(1).max(120),
  grams: z.number().min(0).max(1e6),
  location: z.enum(["fridge", "freezer", "pantry"]),
  purchased: isoDate.optional(),
  expires: isoDate.optional(),
  cost: z.number().min(0).optional(),
  currency: z.string().optional(),
});

export async function upsertInventoryAction(raw: unknown) {
  await assertAuth();
  const it = invSchema.parse(raw);
  const item: InventoryItem = { ...it, id: it.id ?? uid("i") };
  await putDoc("inventory", item.id, item);
  done();
}

export async function addInventoryBatchAction(raw: unknown[]) {
  await assertAuth();
  for (const r of raw) {
    const it = invSchema.parse(r);
    const id = uid("i");
    await putDoc("inventory", id, { ...it, id });
  }
  done();
}

export async function removeInventoryAction(id: string, reason: "used" | "discarded") {
  await assertAuth();
  const it = await getDoc<InventoryItem>("inventory", id);
  if (it && reason === "discarded" && it.grams > 0) {
    await putDoc("meta", `waste:${uid()}`, { kind: "waste", date: todayISO(TIMEZONE), name: it.name, grams: it.grams, cost: it.cost, currency: it.currency, ingredientId: it.ingredientId });
  }
  await deleteDoc("inventory", id);
  done();
}

// ---------------------------------------------------------------- prep

export async function updatePrepAction(weekId: string, patch: Partial<Omit<PrepState, "weekId">>) {
  await assertAuth();
  const prev = await getPrep(weekId);
  const next: PrepState = { ...prev, ...patch, done: { ...prev.done, ...(patch.done ?? {}) }, confirmed: { ...prev.confirmed, ...(patch.confirmed ?? {}) } };
  await putDoc("prep", weekId, next);
  done();
}

/** Mark a session's meals as prepared and deduct the ingredients used from inventory. */
export async function confirmPrepAction(weekId: string, sessionKey: string) {
  await assertAuth();
  const [week, recipes, prep, inventory] = await Promise.all([getWeek(weekId), allRecipes(), getPrep(weekId), getInventory()]);
  if (!week) throw new Error("No plan for this week.");
  if (prep.confirmed[sessionKey]) throw new Error("This session is already confirmed.");
  const { sessions } = buildPrepSchedule(week, recipes, prep);
  const s = sessions.find((x) => x.key === sessionKey);
  if (!s) throw new Error("Session not found.");
  const ids = new Set(s.meals.map((m) => m.meal.id));
  for (const d of week.days) for (const m of d.meals) if (ids.has(m.id) && m.status === "planned") m.status = "prepared";
  await saveWeek(week);

  // Deduct, using the soonest-expiring stock first.
  const used = new Map<string, number>();
  for (const b of s.batches) for (const ing of b.recipe.ingredients) used.set(ing.ingredientId, (used.get(ing.ingredientId) ?? 0) + (ing.grams * b.servings) / b.recipe.servings);
  const deductions: { name: string; grams: number }[] = [];
  for (const [ingredientId, grams] of used) {
    let left = grams;
    const stock = inventory.filter((i) => i.ingredientId === ingredientId && i.grams > 0).sort((a, b) => (a.expires ?? "9999").localeCompare(b.expires ?? "9999"));
    for (const it of stock) {
      if (left <= 0) break;
      const take = Math.min(it.grams, left);
      it.grams = Math.round((it.grams - take) * 10) / 10;
      left -= take;
      if (it.grams <= 0.5) await deleteDoc("inventory", it.id);
      else await putDoc("inventory", it.id, it);
      deductions.push({ name: it.name, grams: take });
    }
  }
  await updatePrepAction(weekId, { confirmed: { [sessionKey]: new Date().toISOString() } });
  done();
  return { meals: ids.size, deductions };
}

// ---------------------------------------------------------------- logging

export async function searchFoodsAction(q: string) {
  await assertAuth();
  return searchFoods(z.string().max(80).parse(q), 15).map((f) => ({ ndb: f.ndb, name: prettyDescription(f.description), per100g: f.per100g, missing: Object.keys(f.missing) }));
}

const logSchema = z.object({
  date: isoDate,
  slot: z.enum(["breakfast", "lunch", "dinner", "snack", "supplement"]),
  name: z.string().min(1).max(160),
  method: z.enum(["manual", "text", "photo", "barcode", "restaurant", "recipe"]),
  items: z.array(z.object({ name: z.string(), grams: z.number().min(0).max(5000), ndb: z.string().optional(), per100g: z.record(z.number()).optional() })),
  totals: z.record(z.number()).optional(),
  estimated: z.boolean(),
  note: z.string().max(500).optional(),
});

export async function addLogAction(raw: unknown) {
  await assertAuth();
  const e = logSchema.parse(raw);
  for (const it of e.items) if (it.ndb && !getFood(it.ndb)) throw new Error(`Unknown food ${it.ndb}`);
  const entry: FoodLogEntry = { ...(e as Omit<FoodLogEntry, "id" | "createdAt">), id: uid("l"), createdAt: new Date().toISOString() };
  await putDoc("log", entry.id, entry);
  done();
}

export async function deleteLogAction(id: string) {
  await assertAuth();
  await deleteDoc("log", id);
  done();
}

export async function addWaterAction(date: string, ml: number) {
  await assertAuth();
  isoDate.parse(date);
  const prev = (await getDoc<{ date: string; ml: number }>("water", date)) ?? { date, ml: 0 };
  await putDoc("water", date, { date, ml: Math.max(0, prev.ml + z.number().min(-2000).max(2000).parse(ml)) });
  done();
}

export async function addWeightAction(date: string, kg: number) {
  await assertAuth();
  await putDoc("weight", isoDate.parse(date), { date, kg: z.number().min(30).max(350).parse(kg) });
  done();
}

export async function deleteWeightAction(date: string) {
  await assertAuth();
  await deleteDoc("weight", date);
  done();
}

// ---------------------------------------------------------------- settings

export async function clearDemoAction() {
  await assertAuth();
  await clearDemo();
  await saveProfile({ ...(await getProfile()), demo: false });
  done();
}

export async function wipeAllAction(confirm: string) {
  await assertAuth();
  if (confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
  await wipeAll();
  done();
  redirect("/onboarding");
}

export async function changePasscodeAction(current: string, next: string) {
  await assertAuth();
  z.string().min(8).parse(next);
  await changePasscode(current, next);
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}

export async function exportDataAction() {
  await assertAuth();
  const cols = ["profile", "targets", "week", "recipe", "inventory", "log", "weight", "water", "feedback", "template", "grocery", "prep", "price"] as const;
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
  for (const c of cols) out[c] = await listDocs(c);
  return JSON.stringify(out, null, 2);
}

export async function targetsNow() {
  await assertAuth();
  return getTargets();
}

/** Move checked grocery lines into inventory with conservative expiry dates, then uncheck them. */
export async function stockFromGroceryAction(weekId: string, fromDate?: string) {
  await assertAuth();
  isoDate.parse(weekId);
  const [week, recipes, inventory, prices, state, profile] = await Promise.all([getWeek(weekId), allRecipes(), getInventory(), getPrices(), getGrocery(weekId), getProfile()]);
  const { lines } = buildGrocery(week ?? null, recipes, inventory, prices, state, profile.currency, fromDate);
  const today = todayISO(TIMEZONE);
  const bought = lines.filter((l) => l.checked && l.toBuy > 0 && !l.staple);
  for (const l of bought) {
    const ing = getIngredient(l.ingredientId);
    const location = ing?.storage ?? "fridge";
    const days = ing?.shelfDays?.[location];
    const id = uid("i");
    await putDoc<InventoryItem>("inventory", id, {
      id, ingredientId: l.ingredientId, name: l.name, grams: Math.round(l.toBuy), location, purchased: today,
      expires: days ? addDays(today, days) : undefined,
      cost: l.cost ? Math.round(l.cost.amount * 100) / 100 : undefined, currency: l.cost ? profile.currency : undefined,
    });
  }
  const checked = { ...state.checked };
  const adjustments = { ...state.adjustments };
  for (const l of bought) { delete checked[l.ingredientId]; delete adjustments[l.ingredientId]; }
  await putDoc("grocery", weekId, { ...state, checked, adjustments });
  done();
  return bought.length;
}

export async function foodsByNdbAction(ndbs: string[]) {
  await assertAuth();
  return z.array(z.string().regex(/^\d{4,6}$/)).max(40).parse(ndbs).flatMap((ndb) => {
    const f = getFood(ndb);
    return f ? [{ ndb, name: prettyDescription(f.description), per100g: f.per100g }] : [];
  });
}

/** Load the labelled demo price list (EGP) for ingredients that have no price yet. */
export async function loadDemoPricesAction() {
  await assertAuth();
  const { demoPrices } = await import("@/lib/nutrition/ingredients");
  const existing = new Set((await getPrices()).map((p) => p.ingredientId));
  let n = 0;
  for (const p of demoPrices()) if (!existing.has(p.ingredientId)) { await putDoc("price", p.ingredientId, p); n++; }
  done();
  return n;
}
