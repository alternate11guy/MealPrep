import { allRecipes, getLogs, TIMEZONE } from "@/lib/store";
import { aiAvailable } from "@/lib/services/ai";
import { logTotals } from "@/lib/services/analytics";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { todayISO } from "@/lib/util";
import { LogClient } from "./log-client";

export const metadata = { title: "Record food" };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ date?: string; tab?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(TIMEZONE);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const [logs, recipes] = await Promise.all([getLogs(), allRecipes()]);
  const entries = logs.filter((l) => l.date === date).map((l) => ({ ...l, t: logTotals(l) }));
  const recipeOptions = recipes.map((r) => ({
    id: r.id, title: r.title, slots: r.slots, kcal: recipeNutrition(r).perServing.kcal,
    // Per-serving items mapped to USDA records so the log keeps exact ingredient data.
    items: r.ingredients.flatMap((i) => { const ing = getIngredient(i.ingredientId); return ing ? [{ name: ing.name, grams: i.grams / r.servings, ndb: ing.ndb }] : []; }),
  }));
  return <LogClient date={date} today={today} tab={sp.tab ?? "search"} ai={aiAvailable()} entries={entries} recipes={recipeOptions} />;
}
