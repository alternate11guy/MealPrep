import { allRecipes, getPrep, getProfile, getWeek, TIMEZONE } from "@/lib/store";
import { buildPrepSchedule, FOOD_SAFETY_SOURCE, STAGE_LABEL, type PrepMeal } from "@/lib/services/prep";
import { recipeNutrition } from "@/lib/nutrition/compute";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { addDays, mondayOf, todayISO } from "@/lib/util";
import { PrepClient, type LabelData, type SessionView } from "./prep-client";

export const metadata = { title: "Meal prep" };

function label(m: PrepMeal, cooked: string | null): LabelData {
  const n = recipeNutrition(m.recipe).perServing;
  const s = m.meal.servings;
  return {
    id: m.meal.id, title: m.recipe.title, recipeId: m.recipe.id, date: m.date, slot: m.meal.slot, cooked,
    useBy: cooked ? addDays(cooked, m.recipe.storage.fridgeDays) : null,
    storage: m.storage, warning: m.warning, weight: Math.round(m.portionWeight), servings: s,
    kcal: n.kcal * s, protein: n.protein * s, carbs: n.carbs * s, fat: n.fat * s,
    reheat: m.recipe.reheating, status: m.meal.status,
  };
}

export default async function PrepPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(TIMEZONE);
  const weekId = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(today);
  const [week, recipes, prep, profile] = await Promise.all([getWeek(weekId), allRecipes(), getPrep(weekId), getProfile()]);
  const { sessions, fresh } = buildPrepSchedule(week ?? null, recipes, prep);
  const views: SessionView[] = sessions.map((s) => ({
    key: s.key, date: s.date, prepMin: s.prepMin, cookMin: s.cookMin, containers: s.containers, equipment: s.equipment,
    confirmed: prep.confirmed[s.key] ?? null,
    batches: s.batches.map((b) => ({
      recipeId: b.recipe.id, title: b.recipe.title, servings: b.servings, fridgeDays: b.recipe.storage.fridgeDays, freezerMonths: b.recipe.storage.freezerMonths,
      ingredients: b.recipe.ingredients.map((i) => ({ name: getIngredient(i.ingredientId)?.name ?? i.ingredientId, grams: (i.grams * b.servings) / b.recipe.servings, note: i.note, group: i.group })),
    })),
    proteins: s.proteins.map((p) => ({ name: p.protein, total: p.total, parts: p.parts })),
    chopping: s.chopping.map((c) => ({ name: c.name, grams: c.grams, notes: c.notes })),
    steps: s.steps.map((x) => ({ id: x.id, stage: x.stage, stageLabel: STAGE_LABEL[x.stage], text: x.text, recipe: x.recipe, timerMin: x.timerMin })),
    labels: s.meals.map((m) => label(m, s.date)),
  }));
  return (
    <PrepClient
      weekId={weekId}
      prevWeek={addDays(weekId, -7)}
      nextWeek={addDays(weekId, 7)}
      today={today}
      hasPlan={Boolean(week)}
      sessionsSetting={prep.sessions}
      customDays={prep.customDays ?? [-1]}
      done={prep.done}
      sessions={views}
      fresh={fresh.map((m) => label(m, null))}
      safety={FOOD_SAFETY_SOURCE}
      name={profile.name}
    />
  );
}
