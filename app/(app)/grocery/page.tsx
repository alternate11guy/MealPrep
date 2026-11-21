import { allRecipes, getGrocery, getInventory, getPrices, getProfile, getWeek, TIMEZONE } from "@/lib/store";
import { AISLES, buildGrocery } from "@/lib/services/grocery";
import { INGREDIENTS } from "@/lib/nutrition/ingredients";
import { addDays, mondayOf, todayISO } from "@/lib/util";
import { GroceryClient } from "./grocery-client";

export const metadata = { title: "Grocery list" };

export default async function GroceryPage({ searchParams }: { searchParams: Promise<{ week?: string; all?: string }> }) {
  const sp = await searchParams;
  const today = todayISO(TIMEZONE);
  const weekId = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(today);
  const isCurrent = weekId === mondayOf(today);
  const fromToday = isCurrent && sp.all !== "1";
  const [week, recipes, inventory, prices, state, profile] = await Promise.all([getWeek(weekId), allRecipes(), getInventory(), getPrices(), getGrocery(weekId), getProfile()]);
  const g = buildGrocery(week ?? null, recipes, inventory, prices, state, profile.currency, fromToday ? today : undefined);
  const priceMap = Object.fromEntries(prices.filter((p) => p.currency === profile.currency).map((p) => [p.ingredientId, { perKg: p.perKg, kind: p.kind }]));
  return (
    <GroceryClient
      weekId={weekId}
      prevWeek={addDays(weekId, -7)}
      nextWeek={addDays(weekId, 7)}
      isCurrent={isCurrent}
      fromToday={fromToday}
      fromDate={fromToday ? today : undefined}
      hasPlan={Boolean(week)}
      lines={g.lines}
      total={g.total}
      kinds={[...g.kinds]}
      unpriced={g.unpriced}
      manual={state.manual}
      removed={Object.keys(state.removed).filter((k) => state.removed[k]).map((id) => ({ id, name: INGREDIENTS.find((i) => i.id === id)?.name ?? id }))}
      aisles={AISLES}
      currency={profile.currency}
      shoppingDay={profile.shoppingDay}
      prices={priceMap}
      catalog={INGREDIENTS.map((i) => ({ id: i.id, name: i.name, aisle: i.aisle }))}
    />
  );
}
