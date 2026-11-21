import { getDoc, listDocs, putDoc } from "./db";
import { HOUSE_RECIPES } from "./data/recipes";
import { PHOTOS } from "./data/photos";
import type {
  Feedback, FoodLogEntry, GroceryState, InventoryItem, PrepState, PriceEntry, Profile, Recipe, Targets,
  WaterEntry, WeekPlan, WeightEntry,
} from "./types";

export const DEFAULT_TARGETS: Targets = {
  kcal: { mode: "exact", value: 935 },
  protein: { mode: "exact", value: 150 },
  carbs: { mode: "exact", value: 50 },
  fat: { mode: "exact", value: 15 },
  fiber: { mode: "min", value: 25 },
};

export const DEFAULT_PROFILE: Profile = {
  activity: "moderate",
  trainingPerWeek: 3,
  diet: [],
  allergies: [],
  dislikes: [],
  goal: "lose",
  mealsPerDay: 4,
  currency: "EGP",
  hydration: true,
  waterTargetMl: 2500,
  supplements: true,
  shoppingDay: 4,
  weeklyProposal: false,
  onboarded: false,
  demo: false,
};

export const TIMEZONE = process.env.APP_TIMEZONE || "Africa/Cairo";

export async function getProfile(): Promise<Profile> {
  return { ...DEFAULT_PROFILE, ...((await getDoc<Profile>("profile", "main")) ?? {}) };
}
export const saveProfile = (p: Profile) => putDoc("profile", "main", p);

export async function getTargets(): Promise<Targets> {
  return (await getDoc<Targets>("targets", "main")) ?? DEFAULT_TARGETS;
}
export const saveTargets = (t: Targets) => putDoc("targets", "main", t);

function withPhoto(r: Recipe): Recipe {
  const p = PHOTOS[r.id];
  return p ? { ...r, photo: p } : r;
}

export async function allRecipes(): Promise<Recipe[]> {
  const user = await listDocs<Recipe>("recipe");
  const overriddenHouse = new Set(user.map((r) => r.id));
  return [...HOUSE_RECIPES.filter((r) => !overriddenHouse.has(r.id)).map(withPhoto), ...user];
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const user = await getDoc<Recipe>("recipe", id);
  if (user) return user;
  const h = HOUSE_RECIPES.find((r) => r.id === id);
  return h ? withPhoto(h) : undefined;
}

export const getWeek = (id: string) => getDoc<WeekPlan>("week", id);
export const saveWeek = (w: WeekPlan) => putDoc("week", w.id, { ...w, updatedAt: new Date().toISOString() });
export const listWeeks = () => listDocs<WeekPlan>("week");

export const getFeedback = () => listDocs<Feedback>("feedback");
export const getInventory = () => listDocs<InventoryItem>("inventory");
export const getPrices = () => listDocs<PriceEntry>("price");
export const getLogs = () => listDocs<FoodLogEntry>("log");
export const getWeights = () => listDocs<WeightEntry>("weight");
export const getWater = () => listDocs<WaterEntry>("water");

export async function getGrocery(weekId: string): Promise<GroceryState> {
  return (await getDoc<GroceryState>("grocery", weekId)) ?? { weekId, checked: {}, adjustments: {}, removed: {}, substitutions: {}, manual: [] };
}
export async function getPrep(weekId: string): Promise<PrepState> {
  return (await getDoc<PrepState>("prep", weekId)) ?? { weekId, sessions: 2, done: {}, confirmed: {} };
}
