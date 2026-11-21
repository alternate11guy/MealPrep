// Shared domain types. Every nutrient value is per 100 g unless a name says otherwise.

export type NutrientKey =
  | "kcal" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sodium" | "satFat"
  | "calcium" | "iron" | "potassium" | "vitC" | "vitD" | "b12";

export type Nutrients = Record<NutrientKey, number>;

/** Per-nutrient flag for values the database does not report. */
export type NutrientGaps = Partial<Record<NutrientKey, true>>;

export interface FoodRecord {
  ndb: string;
  description: string;
  per100g: Nutrients;
  missing: NutrientGaps;
  refusePct: number | null;
  source: "usda-sr28" | "label" | "custom" | "openfoodfacts";
}

export type Aisle =
  | "meat" | "seafood" | "dairy" | "vegetables" | "fruits" | "grains"
  | "herbs" | "sauces" | "supplements" | "other";

export type StorageLocation = "fridge" | "freezer" | "pantry";

export interface Ingredient {
  id: string;
  name: string;
  ndb: string;
  aisle: Aisle;
  storage: StorageLocation;
  /** Cooked weight / raw weight. Undefined means weight does not change meaningfully. */
  yieldFactor?: number;
  yieldBasis?: string;
  /** Typical shelf life of the raw ingredient, conservative, from USDA FoodKeeper ranges. */
  shelfDays?: { fridge?: number; freezer?: number; pantry?: number };
  /** Grams in one natural unit ("1 egg", "1 clove"), for readability only. */
  unit?: { label: string; grams: number };
  /** Protein category used to consolidate batch cooking. */
  protein?: "chicken" | "turkey" | "beef" | "shrimp" | "white-fish" | "salmon" | "tuna" | "egg" | "dairy";
  labelNote?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  grams: number;
  note?: string;
  group?: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "supplement";

export interface RecipeSource {
  kind: "house" | "web" | "user" | "modified";
  name: string;
  url?: string;
  author?: string;
  retrievedAt?: string;
  parentId?: string;
  modificationSummary?: string;
}

export interface Photo {
  kind: "licensed" | "source" | "user" | "generated" | "placeholder";
  url?: string;
  credit?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  alt: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  source: RecipeSource;
  photo: Photo;
  cuisine: string;
  categories: string[];
  slots: MealSlot[];
  prepMin: number;
  cookMin: number;
  servings: number;
  ingredients: RecipeIngredient[];
  /** Free-text ingredient lines kept verbatim from an imported source. */
  originalLines?: string[];
  steps: { text: string; timerMin?: number; stage?: PrepStage }[];
  equipment: string[];
  substitutions: { from: string; to: string; note: string }[];
  storage: { fridgeDays: number; freezerMonths: number | null; note: string };
  reheating: string;
  mealPrep: boolean;
  tags?: string[];
}

export type PrepStage =
  | "prepare" | "wash-chop" | "marinate" | "cook" | "sauce" | "weigh" | "assemble" | "label" | "store";

export type TargetMode = "min" | "max" | "range" | "exact";
export interface Target { mode: TargetMode; value: number; min?: number; max?: number }
export interface Targets {
  kcal: Target;
  protein: Target;
  carbs: Target;
  fat: Target;
  fiber?: Target;
}

export interface Profile {
  name?: string;
  age?: number;
  sex?: "female" | "male";
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  activity: "sedentary" | "light" | "moderate" | "active" | "very-active";
  trainingPerWeek: number;
  diet: string[];
  allergies: string[];
  dislikes: string[];
  goal: "lose" | "maintain" | "gain";
  mealsPerDay: number;
  clinicianKcal?: number;
  currency: string;
  hydration: boolean;
  waterTargetMl: number;
  supplements: boolean;
  shoppingDay: number; // 0 = Monday
  weeklyProposal: boolean;
  onboarded: boolean;
  demo: boolean;
}

export type MealStatus = "planned" | "prepared" | "eaten" | "skipped";

export interface PlannedMeal {
  id: string;
  slot: MealSlot;
  recipeId: string;
  /** Number of recipe servings in this meal (portion multiplier). */
  servings: number;
  locked: boolean;
  status: MealStatus;
  eatenServings?: number;
  eatenAt?: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  meals: PlannedMeal[];
}

export interface GenerateOptions {
  targets: Targets;
  mealsPerDay: number;
  slots: MealSlot[];
  weeklyBudget?: number;
  available: string[]; // ingredient ids
  cuisines: string[];
  maxPrepMin?: number;
  cookingSessions: number;
  exclude: string[]; // ingredient ids
  allowRepeats: boolean;
  supplements: boolean;
  seed?: number;
}

export interface WeekPlan {
  id: string; // Monday date
  days: PlanDay[];
  status: "draft" | "proposed" | "confirmed";
  generatedWith?: GenerateOptions;
  proposer?: "engine" | "claude";
  notes?: string[];
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
}

export interface FoodLogEntry {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  method: "manual" | "text" | "photo" | "barcode" | "restaurant" | "recipe";
  items: { name: string; grams: number; ndb?: string; per100g?: Partial<Nutrients> }[];
  /** Totals when entered directly (restaurant labels etc). */
  totals?: Partial<Nutrients>;
  estimated: boolean;
  note?: string;
  createdAt: string;
  demo?: boolean;
}

export interface InventoryItem {
  id: string;
  ingredientId?: string;
  name: string;
  grams: number;
  location: StorageLocation;
  purchased?: string;
  expires?: string;
  cost?: number;
  currency?: string;
  demo?: boolean;
}

export interface PriceEntry {
  ingredientId: string;
  perKg: number;
  currency: string;
  kind: "manual" | "estimate" | "verified" | "demo";
  note?: string;
  updatedAt: string;
}

export interface GroceryState {
  weekId: string;
  checked: Record<string, boolean>;
  adjustments: Record<string, number>; // grams override for purchase
  removed: Record<string, boolean>;
  substitutions: Record<string, string>; // ingredientId -> ingredientId
  manual: { id: string; name: string; qty: string; aisle: Aisle; checked: boolean }[];
}

export interface PrepState {
  weekId: string;
  sessions: number | "custom";
  customDays?: number[];
  done: Record<string, boolean>;
  confirmed: Record<string, string>; // session key -> ISO date confirmed
}

export type FeedbackTag = "loved" | "again" | "difficult" | "expensive" | "disliked" | "never";
export interface Feedback { recipeId: string; tags: FeedbackTag[]; rating?: number; favorite?: boolean; updatedAt: string }

export interface WeightEntry { date: string; kg: number; demo?: boolean }
export interface WaterEntry { date: string; ml: number }
