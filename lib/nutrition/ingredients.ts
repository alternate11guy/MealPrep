import type { Aisle, Ingredient, PriceEntry } from "@/lib/types";
import { getFood, prettyDescription } from "./foods";

/**
 * Curated ingredient catalog. Each entry points at one USDA SR28 record (NDB number).
 * Quantities in recipes are RAW, as-purchased-edible weights unless a note says otherwise.
 *
 * yieldFactor (cooked / raw weight) for proteins and grains is derived from the SR28 database
 * itself: the ratio of protein (meat, fish) or carbohydrate (grains) density between the raw
 * and cooked records of the same food. Values for vegetables are not modelled (weight change is
 * small relative to portioning error) and are left undefined.
 *
 * shelfDays use the conservative end of USDA FoodKeeper / FSIS cold-storage ranges.
 */
const SR = "Derived from USDA SR28 raw vs cooked records";

export const INGREDIENTS: Ingredient[] = [
  // Meat & poultry
  { id: "chicken-breast", name: "Chicken breast, skinless", ndb: "05062", aisle: "meat", storage: "fridge", yieldFactor: 0.725, yieldBasis: `${SR} (05062 → 05064, roasted)`, shelfDays: { fridge: 2, freezer: 270 }, protein: "chicken" },
  { id: "turkey-mince", name: "Ground turkey, extra lean", ndb: "05662", aisle: "meat", storage: "fridge", yieldFactor: 0.744, yieldBasis: `${SR} (05662 → 05663)`, shelfDays: { fridge: 2, freezer: 120 }, protein: "turkey" },
  { id: "beef-mince-95", name: "Lean ground beef, 95%", ndb: "23557", aisle: "meat", storage: "fridge", yieldFactor: 0.734, yieldBasis: `${SR} (23557 → 23560)`, shelfDays: { fridge: 2, freezer: 120 }, protein: "beef" },
  { id: "beef-sirloin", name: "Top sirloin steak, trimmed", ndb: "23611", aisle: "meat", storage: "fridge", yieldFactor: 0.751, yieldBasis: `${SR} (23611 → 23610, broiled)`, shelfDays: { fridge: 4, freezer: 180 }, protein: "beef" },
  // Seafood
  { id: "shrimp", name: "Shrimp, peeled", ndb: "15270", aisle: "seafood", storage: "fridge", yieldFactor: 0.838, yieldBasis: `${SR} (15270 → 15271)`, shelfDays: { fridge: 2, freezer: 180 }, protein: "shrimp" },
  { id: "cod", name: "Cod fillet", ndb: "15015", aisle: "seafood", storage: "fridge", yieldFactor: 0.78, yieldBasis: `${SR} (15015 → 15016)`, shelfDays: { fridge: 2, freezer: 180 }, protein: "white-fish" },
  { id: "tilapia", name: "Tilapia fillet", ndb: "15261", aisle: "seafood", storage: "fridge", yieldFactor: 0.768, yieldBasis: `${SR} (15261 → 15262)`, shelfDays: { fridge: 2, freezer: 180 }, protein: "white-fish" },
  { id: "salmon-sockeye", name: "Sockeye salmon fillet", ndb: "15085", aisle: "seafood", storage: "fridge", yieldFactor: 0.84, yieldBasis: `${SR} (15085 → 15086)`, shelfDays: { fridge: 2, freezer: 90 }, protein: "salmon" },
  { id: "tuna-water", name: "Light tuna in water, drained", ndb: "15121", aisle: "seafood", storage: "pantry", shelfDays: { pantry: 730 }, protein: "tuna" },
  // Dairy & eggs
  { id: "egg-white", name: "Egg whites", ndb: "01124", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 4 }, unit: { label: "white of 1 large egg", grams: 33 }, protein: "egg" },
  { id: "egg", name: "Whole egg", ndb: "01123", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 21 }, unit: { label: "large egg", grams: 50 }, protein: "egg" },
  { id: "greek-yogurt", name: "Greek yogurt, plain, nonfat", ndb: "01256", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 7 }, protein: "dairy" },
  { id: "cottage-cheese", name: "Cottage cheese, 1% fat", ndb: "01016", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 7 }, protein: "dairy" },
  { id: "skim-milk", name: "Skim milk", ndb: "01085", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "feta", name: "Feta", ndb: "01019", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "parmesan", name: "Parmesan, grated", ndb: "01032", aisle: "dairy", storage: "fridge", shelfDays: { fridge: 30 } },
  // Supplements
  { id: "whey", name: "Whey protein powder", ndb: "14066", aisle: "supplements", storage: "pantry", shelfDays: { pantry: 365 }, labelNote: "Values are USDA's generic whey-based powder. Enter your product's label in Settings for exact numbers." },
  // Vegetables
  { id: "broccoli", name: "Broccoli florets", ndb: "11090", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 4 } },
  { id: "cauliflower", name: "Cauliflower (riced or florets)", ndb: "11135", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "spinach", name: "Baby spinach", ndb: "11457", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 4 } },
  { id: "zucchini", name: "Zucchini", ndb: "11477", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "red-pepper", name: "Red bell pepper", ndb: "11821", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 7 }, unit: { label: "medium pepper", grams: 119 } },
  { id: "onion", name: "Onion", ndb: "11282", aisle: "vegetables", storage: "pantry", shelfDays: { pantry: 30 }, unit: { label: "medium onion", grams: 110 } },
  { id: "garlic", name: "Garlic", ndb: "11215", aisle: "vegetables", storage: "pantry", shelfDays: { pantry: 30 }, unit: { label: "clove", grams: 3 } },
  { id: "tomato", name: "Tomatoes", ndb: "11529", aisle: "vegetables", storage: "pantry", shelfDays: { pantry: 5 }, unit: { label: "medium tomato", grams: 123 } },
  { id: "cucumber", name: "Cucumber", ndb: "11205", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "romaine", name: "Romaine lettuce", ndb: "11251", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "mushroom", name: "White mushrooms", ndb: "11260", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "green-beans", name: "Green beans", ndb: "11052", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "asparagus", name: "Asparagus", ndb: "11011", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 4 } },
  { id: "cabbage", name: "Cabbage", ndb: "11109", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 14 } },
  { id: "carrot", name: "Carrot", ndb: "11124", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 21 } },
  { id: "eggplant", name: "Eggplant", ndb: "11209", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "kale", name: "Kale", ndb: "11233", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 5 } },
  { id: "scallion", name: "Spring onions", ndb: "11291", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "ginger", name: "Fresh ginger", ndb: "11216", aisle: "vegetables", storage: "fridge", shelfDays: { fridge: 21 } },
  { id: "sweet-potato", name: "Sweet potato", ndb: "11507", aisle: "vegetables", storage: "pantry", shelfDays: { pantry: 21 } },
  { id: "peas-frozen", name: "Green peas, frozen", ndb: "11312", aisle: "vegetables", storage: "freezer", shelfDays: { freezer: 240 } },
  { id: "pickles", name: "Dill pickles", ndb: "11937", aisle: "sauces", storage: "fridge", shelfDays: { fridge: 60 } },
  // Herbs & aromatics
  { id: "parsley", name: "Flat-leaf parsley", ndb: "11297", aisle: "herbs", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "cilantro", name: "Coriander leaves", ndb: "11165", aisle: "herbs", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "mint", name: "Mint", ndb: "02065", aisle: "herbs", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "dill", name: "Dill", ndb: "02045", aisle: "herbs", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "lemon-juice", name: "Lemon juice (fresh)", ndb: "09152", aisle: "fruits", storage: "fridge", shelfDays: { fridge: 21 }, unit: { label: "lemon, juiced", grams: 47 } },
  { id: "lime-juice", name: "Lime juice (fresh)", ndb: "09160", aisle: "fruits", storage: "fridge", shelfDays: { fridge: 21 }, unit: { label: "lime, juiced", grams: 44 } },
  // Fruit
  { id: "strawberries", name: "Strawberries", ndb: "09316", aisle: "fruits", storage: "fridge", shelfDays: { fridge: 3 } },
  { id: "blueberries", name: "Blueberries", ndb: "09050", aisle: "fruits", storage: "fridge", shelfDays: { fridge: 7 } },
  { id: "banana", name: "Banana", ndb: "09040", aisle: "fruits", storage: "pantry", shelfDays: { pantry: 5 } },
  // Grains & starches
  { id: "rice", name: "Long-grain white rice (dry)", ndb: "20044", aisle: "grains", storage: "pantry", yieldFactor: 2.838, yieldBasis: `${SR} (20044 → 20045)`, shelfDays: { pantry: 730 } },
  { id: "quinoa", name: "Quinoa (dry)", ndb: "20035", aisle: "grains", storage: "pantry", yieldFactor: 3.012, yieldBasis: `${SR} (20035 → 20137)`, shelfDays: { pantry: 730 } },
  { id: "oats", name: "Rolled oats", ndb: "08120", aisle: "grains", storage: "pantry", shelfDays: { pantry: 365 } },
  { id: "bulgur", name: "Bulgur (dry)", ndb: "20012", aisle: "grains", storage: "pantry", yieldFactor: 4.083, yieldBasis: `${SR} (20012 → 20013)`, shelfDays: { pantry: 365 } },
  { id: "lentils", name: "Red or brown lentils (dry)", ndb: "16069", aisle: "grains", storage: "pantry", yieldFactor: 3.147, yieldBasis: `${SR} (16069 → 16070)`, shelfDays: { pantry: 365 } },
  { id: "chickpeas", name: "Chickpeas, canned, drained", ndb: "16359", aisle: "grains", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "black-beans", name: "Black beans, canned, low sodium", ndb: "16316", aisle: "grains", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "ww-pita", name: "Whole-wheat pita", ndb: "18042", aisle: "grains", storage: "pantry", shelfDays: { pantry: 5, freezer: 90 }, unit: { label: "small pita", grams: 28 } },
  // Sauces, condiments, pantry
  { id: "olive-oil", name: "Olive oil", ndb: "04053", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 365 }, unit: { label: "teaspoon", grams: 4.5 } },
  { id: "sesame-oil", name: "Toasted sesame oil", ndb: "04058", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 365 } },
  { id: "soy-sauce", name: "Soy sauce, low sodium", ndb: "16424", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "fish-sauce", name: "Fish sauce", ndb: "06179", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "sriracha", name: "Sriracha", ndb: "06631", aisle: "sauces", storage: "fridge", shelfDays: { fridge: 180 } },
  { id: "tomato-paste", name: "Tomato paste", ndb: "11546", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 540 } },
  { id: "crushed-tomatoes", name: "Crushed tomatoes, canned", ndb: "11693", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 540 } },
  { id: "mustard", name: "Yellow mustard", ndb: "02046", aisle: "sauces", storage: "fridge", shelfDays: { fridge: 365 } },
  { id: "honey", name: "Honey", ndb: "19296", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "cider-vinegar", name: "Apple cider vinegar", ndb: "02048", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "tahini", name: "Tahini", ndb: "12698", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 180 } },
  { id: "salsa", name: "Tomato salsa", ndb: "06605", aisle: "sauces", storage: "fridge", shelfDays: { fridge: 14 } },
  { id: "chicken-stock", name: "Chicken stock, low sodium", ndb: "06970", aisle: "sauces", storage: "pantry", shelfDays: { pantry: 365 } },
  { id: "cornstarch", name: "Cornstarch", ndb: "20027", aisle: "other", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "baking-powder", name: "Baking powder", ndb: "18369", aisle: "other", storage: "pantry", shelfDays: { pantry: 365 } },
  { id: "cocoa", name: "Cocoa powder, unsweetened", ndb: "19165", aisle: "other", storage: "pantry", shelfDays: { pantry: 730 } },
  { id: "vanilla", name: "Vanilla extract", ndb: "02050", aisle: "other", storage: "pantry", shelfDays: { pantry: 1095 } },
  // Spices
  { id: "salt", name: "Salt", ndb: "02047", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 3650 } },
  { id: "black-pepper", name: "Black pepper", ndb: "02030", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "cumin", name: "Ground cumin", ndb: "02014", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "paprika", name: "Paprika", ndb: "02028", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "turmeric", name: "Turmeric", ndb: "02043", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "cinnamon", name: "Cinnamon", ndb: "02010", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "allspice", name: "Allspice", ndb: "02001", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "coriander-seed", name: "Ground coriander", ndb: "02013", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "chili-powder", name: "Chili powder", ndb: "02009", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "cayenne", name: "Cayenne / chili flakes", ndb: "02031", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "oregano", name: "Dried oregano", ndb: "02027", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "thyme", name: "Dried thyme", ndb: "02042", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "garlic-powder", name: "Garlic powder", ndb: "02020", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
  { id: "onion-powder", name: "Onion powder", ndb: "02026", aisle: "herbs", storage: "pantry", shelfDays: { pantry: 1095 } },
];

const map = new Map(INGREDIENTS.map((i) => [i.id, i]));

/** SR28 food-group code (first two digits of the NDB number) to grocery aisle. */
const GROUP_AISLE: Record<string, Aisle> = {
  "01": "dairy", "02": "herbs", "04": "sauces", "05": "meat", "06": "sauces", "07": "meat", "08": "grains",
  "09": "fruits", "10": "meat", "11": "vegetables", "12": "other", "13": "meat", "14": "other", "15": "seafood",
  "16": "grains", "17": "meat", "18": "grains", "19": "other", "20": "grains",
};

/**
 * Catalog ingredients by id, plus any SR28 food referenced as "ndb:<number>" (used by imported
 * and custom recipes so they are not limited to the curated catalog).
 */
export function getIngredient(id: string): Ingredient | undefined {
  const hit = map.get(id);
  if (hit) return hit;
  if (id.startsWith("ndb:")) {
    const food = getFood(id.slice(4));
    if (!food) return undefined;
    const ing: Ingredient = {
      id, name: prettyDescription(food.description), ndb: food.ndb,
      aisle: GROUP_AISLE[food.ndb.slice(0, 2)] ?? "other", storage: "fridge",
    };
    map.set(id, ing);
    return ing;
  }
  return undefined;
}

/** Spices and seasonings bought by the jar: not added to the shopping quantities. */
export function isStaple(id: string) {
  const i = map.get(id);
  if (!i) return false;
  return i.aisle === "herbs" && i.storage === "pantry";
}

/**
 * Demonstration price points (EGP per kg), used only until real prices are entered.
 * They are rough illustrative figures, NOT supermarket prices, and are labelled "demo" everywhere.
 */
const DEMO_EGP_PER_KG: Record<string, number> = {
  "chicken-breast": 320, "turkey-mince": 600, "beef-mince-95": 520, "beef-sirloin": 650, shrimp: 700,
  cod: 650, tilapia: 160, "salmon-sockeye": 1300, "tuna-water": 650, "egg-white": 150, egg: 110,
  "greek-yogurt": 240, "cottage-cheese": 220, "skim-milk": 50, feta: 300, parmesan: 1200, whey: 2600,
  broccoli: 80, cauliflower: 30, spinach: 60, zucchini: 30, "red-pepper": 70, onion: 20, garlic: 90,
  tomato: 25, cucumber: 25, romaine: 40, mushroom: 140, "green-beans": 40, asparagus: 300, cabbage: 15,
  carrot: 20, eggplant: 25, kale: 120, scallion: 40, ginger: 120, "sweet-potato": 30, "peas-frozen": 90,
  parsley: 60, cilantro: 60, mint: 60, dill: 60, "lemon-juice": 60, "lime-juice": 80, strawberries: 90,
  blueberries: 700, banana: 40, rice: 40, quinoa: 450, oats: 120, bulgur: 50, lentils: 70, chickpeas: 90,
  "black-beans": 150, "ww-pita": 80, "olive-oil": 450, "sesame-oil": 600, "soy-sauce": 200, "fish-sauce": 250,
  sriracha: 350, "tomato-paste": 90, "crushed-tomatoes": 80, mustard: 150, honey: 300, "cider-vinegar": 120,
  tahini: 250, salsa: 250, "chicken-stock": 60, pickles: 80, cocoa: 600, cornstarch: 60,
};

export function demoPrices(): PriceEntry[] {
  const now = new Date().toISOString();
  return Object.entries(DEMO_EGP_PER_KG).map(([ingredientId, perKg]) => ({
    ingredientId, perKg, currency: "EGP", kind: "demo",
    note: "Illustrative demo figure, not a supermarket price", updatedAt: now,
  }));
}
