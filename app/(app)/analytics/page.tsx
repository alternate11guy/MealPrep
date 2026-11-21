import { allRecipes, getFeedback, getInventory, getLogs, getPrices, getProfile, getTargets, getWeights, listWeeks, TIMEZONE } from "@/lib/store";
import { listDocs } from "@/lib/db";
import { averages, complianceRate, dailySeries } from "@/lib/services/analytics";
import { planCost } from "@/lib/services/planner";
import { targetBounds } from "@/lib/nutrition/targets";
import { addDays, daysBetween, mondayOf, todayISO } from "@/lib/util";
import { AnalyticsClient } from "./analytics-client";

export const metadata = { title: "Nutrition analytics" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(TIMEZONE);
  let range = ["7", "30", "90", "custom"].includes(sp.range ?? "") ? sp.range! : "7";
  let from = addDays(today, -(Number(range === "custom" ? 7 : range) - 1));
  let to = today;
  if (range === "custom" && sp.from && sp.to && ISO.test(sp.from) && ISO.test(sp.to) && sp.from <= sp.to && daysBetween(sp.from, sp.to) <= 366) { from = sp.from; to = sp.to; }
  else if (range === "custom") range = "7";
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);

  const [weeks, logs, recipes, targets, weights, profile, feedback, prices, inventory, meta] = await Promise.all([
    listWeeks(), getLogs(), allRecipes(), getTargets(), getWeights(), getProfile(), getFeedback(), getPrices(), getInventory(), listDocs<{ kind?: string; date?: string; grams?: number; cost?: number; name?: string }>("meta"),
  ]);
  const series = dailySeries(dates, weeks, logs, recipes);
  const pick = (n: { kcal: number; protein: number; carbs: number; fat: number }) => ({ kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat });
  const daily = series.map((d) => ({ date: d.date, planned: pick(d.planned), actual: pick(d.actual), tracked: d.eatenMeals + d.logged > 0, plannedMeals: d.plannedMeals, eatenMeals: d.eatenMeals }));

  const keys = ["kcal", "protein", "carbs", "fat"] as const;
  const comp = Object.fromEntries(keys.map((k) => [k, { actual: complianceRate(series, targets, k, "actual"), planned: complianceRate(series, targets, k, "planned") }]));
  const avgActual = averages(series, "actual");
  const avgPlanned = averages(series, "planned");
  const bounds = Object.fromEntries(keys.map((k) => [k, targetBounds(targets[k])]));

  // Meals: adherence and favourites within range.
  const counts = new Map<string, { eaten: number; skipped: number }>();
  let plannedMeals = 0, eaten = 0, skipped = 0;
  for (const w of weeks) for (const d of w.days) {
    if (d.date < from || d.date > to || d.date > today) continue;
    for (const m of d.meals) {
      plannedMeals++;
      const c = counts.get(m.recipeId) ?? { eaten: 0, skipped: 0 };
      if (m.status === "eaten") { eaten++; c.eaten++; }
      if (m.status === "skipped") { skipped++; c.skipped++; }
      counts.set(m.recipeId, c);
    }
  }
  const title = (id: string) => recipes.find((r) => r.id === id)?.title ?? "Deleted recipe";
  const fb = new Map(feedback.map((f) => [f.recipeId, f]));
  const topMeals = [...counts.entries()].filter(([, c]) => c.eaten > 0).sort((a, b) => b[1].eaten - a[1].eaten).slice(0, 6)
    .map(([id, c]) => ({ id, title: title(id), eaten: c.eaten, skipped: c.skipped, rating: fb.get(id)?.rating, favorite: Boolean(fb.get(id)?.favorite) }));
  const mostSkipped = [...counts.entries()].filter(([, c]) => c.skipped > 0).sort((a, b) => b[1].skipped - a[1].skipped).slice(0, 3).map(([id, c]) => ({ id, title: title(id), skipped: c.skipped }));

  // Spend: plan-based estimates per week overlapping the range, plus recorded purchases and waste.
  const priceMap = new Map(prices.map((p) => [p.ingredientId, p]));
  const weekSpend = weeks.filter((w) => w.id <= to && addDays(w.id, 6) >= from).sort((a, b) => a.id.localeCompare(b.id))
    .map((w) => { const c = planCost(w, recipes, priceMap, profile.currency); return { week: w.id, estimate: Math.round(c.total), coverage: c.coverage }; });
  const purchases = inventory.filter((i) => i.purchased && i.purchased >= from && i.purchased <= to && i.cost && i.currency === profile.currency).reduce((s, i) => s + (i.cost ?? 0), 0);
  const waste = meta.filter((m) => m.kind === "waste" && m.date && m.date >= from && m.date <= to);
  const priceKinds = [...new Set(prices.filter((p) => p.currency === profile.currency).map((p) => p.kind))];

  const weightSeries = weights.filter((w) => w.date >= addDays(from, -1) && w.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ date: w.date, kg: w.kg, demo: Boolean(w.demo) }));
  const allWeights = weights.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <AnalyticsClient
      range={range} from={from} to={to} today={today}
      daily={daily}
      targets={targets} bounds={bounds}
      compliance={comp}
      avgActual={avgActual ? { days: avgActual.days, ...pick(avgActual.avg) } : null}
      avgPlanned={avgPlanned ? { days: avgPlanned.days, ...pick(avgPlanned.avg) } : null}
      adherence={{ planned: plannedMeals, eaten, skipped }}
      topMeals={topMeals} mostSkipped={mostSkipped}
      spend={{ weeks: weekSpend, purchases, currency: profile.currency, priceKinds, wasteCount: waste.length, wasteGrams: waste.reduce((s, w) => s + (w.grams ?? 0), 0), wasteCost: waste.reduce((s, w) => s + (w.cost ?? 0), 0) }}
      weights={weightSeries}
      weightContext={{ first: allWeights[0] ?? null, last: allWeights[allWeights.length - 1] ?? null, target: profile.targetWeightKg ?? null }}
      currentWeek={mondayOf(today)}
      demo={weeks.some((w) => w.demo) || weights.some((w) => w.demo)}
    />
  );
}
