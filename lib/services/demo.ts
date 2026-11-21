import { putDoc, deleteWhere } from "@/lib/db";
import { demoPrices } from "@/lib/nutrition/ingredients";
import { addDays, mondayOf, uid } from "@/lib/util";
import { generateWeek, slotsFor } from "./planner";
import { allRecipes, getProfile, getTargets, saveWeek } from "@/lib/store";
import type { InventoryItem, WeightEntry } from "@/lib/types";

/**
 * Demonstration data, clearly flagged with `demo: true` and removable in Settings.
 * Plans are produced by the real engine; past "eaten" meals simulate a week of use so
 * analytics have something to show. Prices are illustrative demo figures only.
 */
export async function seedDemo(today: string) {
  const profile = await getProfile();
  const targets = await getTargets();
  const recipes = await allRecipes();
  const monday = mondayOf(today);
  const lastMonday = addDays(monday, -7);
  const prices = demoPrices();
  for (const p of prices) await putDoc("price", p.ingredientId, p);

  const ctx = { recipes, feedback: [], inventory: [], prices, profile, today };
  for (const [weekId, seed] of [[lastMonday, 7], [monday, 11]] as const) {
    const { plan } = generateWeek(weekId, {
      targets, mealsPerDay: profile.mealsPerDay, slots: slotsFor(profile.mealsPerDay, profile.supplements),
      available: [], cuisines: ["Middle Eastern", "Mediterranean"], cookingSessions: 2, exclude: [],
      allowRepeats: true, supplements: profile.supplements, seed,
    }, ctx);
    plan.demo = true;
    plan.status = "confirmed";
    for (const d of plan.days) {
      if (d.date >= today) continue;
      d.meals.forEach((m, i) => {
        // Simulated history: most meals eaten as planned, an occasional skip.
        const skip = (d.date.charCodeAt(9) + i) % 11 === 0;
        m.status = skip ? "skipped" : "eaten";
        if (!skip) m.eatenServings = m.servings;
      });
    }
    await saveWeek(plan);
  }

  const inv: InventoryItem[] = [
    { id: uid("i"), ingredientId: "greek-yogurt", name: "Greek yogurt, plain, nonfat", grams: 500, location: "fridge", purchased: addDays(today, -2), expires: addDays(today, 5), demo: true },
    { id: uid("i"), ingredientId: "egg", name: "Whole egg", grams: 300, location: "fridge", purchased: addDays(today, -6), expires: addDays(today, 15), demo: true },
    { id: uid("i"), ingredientId: "spinach", name: "Baby spinach", grams: 150, location: "fridge", purchased: addDays(today, -3), expires: addDays(today, 1), demo: true },
    { id: uid("i"), ingredientId: "chicken-breast", name: "Chicken breast, skinless", grams: 1000, location: "freezer", purchased: addDays(today, -10), expires: addDays(today, 200), demo: true },
    { id: uid("i"), ingredientId: "rice", name: "Long-grain white rice (dry)", grams: 900, location: "pantry", purchased: addDays(today, -30), expires: addDays(today, 500), demo: true },
    { id: uid("i"), ingredientId: "crushed-tomatoes", name: "Crushed tomatoes, canned", grams: 800, location: "pantry", purchased: addDays(today, -20), expires: addDays(today, 400), demo: true },
    { id: uid("i"), ingredientId: "olive-oil", name: "Olive oil", grams: 450, location: "pantry", purchased: addDays(today, -40), expires: addDays(today, 300), demo: true },
  ];
  for (const it of inv) await putDoc("inventory", it.id, it);

  if (profile.weightKg) {
    const w: WeightEntry[] = [-14, -10, -7, -3, 0].map((d, i) => ({ date: addDays(today, d), kg: Number((profile.weightKg! + 1.2 - i * 0.3).toFixed(1)), demo: true }));
    for (const x of w) await putDoc("weight", x.date, x);
  }
}

export async function clearDemo() {
  for (const c of ["week", "inventory", "weight", "log"] as const) await deleteWhere(c, (d) => d.demo === true);
  await deleteWhere("price", (d) => d.kind === "demo");
}
