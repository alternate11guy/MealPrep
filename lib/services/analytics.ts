import { add, zero, compliance } from "@/lib/nutrition/compute";
import { getFood } from "@/lib/nutrition/foods";
import { dayTotals } from "./planner";
import type { FoodLogEntry, Nutrients, Recipe, Targets, WeekPlan } from "@/lib/types";

export function logTotals(e: FoodLogEntry): Nutrients {
  if (e.totals) return add(zero(), e.totals);
  let t = zero();
  for (const it of e.items) {
    const per = it.per100g ?? (it.ndb ? getFood(it.ndb)?.per100g : undefined);
    if (per) t = add(t, per, it.grams / 100);
  }
  return t;
}

export interface DaySeries {
  date: string;
  planned: Nutrients;
  actual: Nutrients;
  logged: number;
  eatenMeals: number;
  plannedMeals: number;
}

export function dailySeries(dates: string[], weeks: WeekPlan[], logs: FoodLogEntry[], recipes: Recipe[]): DaySeries[] {
  const dayMap = new Map<string, WeekPlan["days"][number]>();
  for (const w of weeks) for (const d of w.days) dayMap.set(d.date, d);
  return dates.map((date) => {
    const day = dayMap.get(date);
    const planned = day ? dayTotals(day, recipes, "planned") : zero();
    let actual = day ? dayTotals(day, recipes, "actual") : zero();
    const dayLogs = logs.filter((l) => l.date === date);
    for (const l of dayLogs) actual = add(actual, logTotals(l));
    return {
      date, planned, actual, logged: dayLogs.length,
      eatenMeals: day?.meals.filter((m) => m.status === "eaten").length ?? 0,
      plannedMeals: day?.meals.filter((m) => m.status !== "skipped").length ?? 0,
    };
  });
}

export function complianceRate(series: DaySeries[], targets: Targets, key: "kcal" | "protein" | "carbs" | "fat", mode: "planned" | "actual") {
  const days = series.filter((d) => (mode === "actual" ? d.eatenMeals + d.logged > 0 : d.plannedMeals > 0));
  if (!days.length) return null;
  const met = days.filter((d) => compliance(d[mode][key], targets[key]) === "met").length;
  return { met, of: days.length };
}

export function averages(series: DaySeries[], mode: "planned" | "actual") {
  const days = series.filter((d) => (mode === "actual" ? d.eatenMeals + d.logged > 0 : d.plannedMeals > 0));
  if (!days.length) return null;
  let t = zero();
  for (const d of days) t = add(t, d[mode]);
  return { days: days.length, avg: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / days.length])) as Nutrients };
}
