import { allRecipes, getInventory, getProfile, getTargets, getWeek, TIMEZONE } from "@/lib/store";
import { dayTotals, slotsFor, validateDay, planCost } from "@/lib/services/planner";
import { getPrices } from "@/lib/store";
import { INGREDIENTS } from "@/lib/nutrition/ingredients";
import { addDays, mondayOf, todayISO, weekDates } from "@/lib/util";
import { summaryMap } from "@/lib/view";
import { listDocs } from "@/lib/db";
import { PlanClient } from "./plan-client";
import type { WeekPlan } from "@/lib/types";

export const metadata = { title: "Weekly meal plan" };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string; generate?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(TIMEZONE);
  const weekId = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(today);
  const [recipes, targets, profile, week, inventory, prices, templates] = await Promise.all([
    allRecipes(), getTargets(), getProfile(), getWeek(weekId), getInventory(), getPrices(), listDocs<WeekPlan & { name: string }>("template"),
  ]);
  const dates = weekDates(weekId);
  const days = dates.map((date) => {
    const d = week?.days.find((x) => x.date === date) ?? { date, meals: [] };
    const totals = dayTotals(d, recipes, "planned");
    const v = d.meals.length ? validateDay(d, recipes, targets) : null;
    return {
      date, meals: d.meals,
      totals: { kcal: totals.kcal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat, fiber: totals.fiber },
      ok: v?.satisfied ?? false,
      violations: v?.violations.map((x) => ({ label: x.label, by: x.by, key: x.key })) ?? [],
      conflicts: v?.conflicts ?? [],
    };
  });
  const cost = week ? planCost(week, recipes, new Map(prices.map((p) => [p.ingredientId, p])), profile.currency) : null;
  const usedIds = new Set(week?.days.flatMap((d) => d.meals.map((m) => m.recipeId)) ?? []);
  const libraryForAdd = recipes.map((r) => ({ id: r.id, title: r.title, slots: r.slots, cuisine: r.cuisine }));
  const cuisines = [...new Set(recipes.map((r) => r.cuisine))].sort();

  return (
    <PlanClient
      weekId={weekId}
      today={today}
      prevWeek={addDays(weekId, -7)}
      nextWeek={addDays(weekId, 7)}
      initialDay={sp.day && dates.includes(sp.day) ? sp.day : dates.includes(today) ? today : dates[0]}
      openGenerate={sp.generate === "1"}
      hasPlan={Boolean(week)}
      status={week?.status ?? null}
      demo={Boolean(week?.demo)}
      notes={week?.notes ?? []}
      proposer={week?.proposer ?? null}
      days={days}
      summaries={Object.fromEntries(Object.entries(summaryMap(recipes)).filter(([id]) => usedIds.has(id)))}
      library={libraryForAdd}
      targets={targets}
      cost={cost}
      currency={profile.currency}
      defaults={{
        mealsPerDay: week?.generatedWith?.mealsPerDay ?? profile.mealsPerDay,
        slots: week?.generatedWith?.slots ?? slotsFor(profile.mealsPerDay, profile.supplements),
        supplements: week?.generatedWith?.supplements ?? profile.supplements,
        allowRepeats: week?.generatedWith?.allowRepeats ?? true,
        cookingSessions: week?.generatedWith?.cookingSessions ?? 2,
        maxPrepMin: week?.generatedWith?.maxPrepMin,
        weeklyBudget: week?.generatedWith?.weeklyBudget,
        cuisines: week?.generatedWith?.cuisines ?? [],
        exclude: week?.generatedWith?.exclude ?? [],
        available: [...new Set(inventory.filter((i) => i.ingredientId && i.grams > 0).map((i) => i.ingredientId!))],
      }}
      catalog={INGREDIENTS.map((i) => ({ id: i.id, name: i.name }))}
      cuisines={cuisines}
      templates={templates.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
