import { getIngredient, isStaple } from "@/lib/nutrition/ingredients";
import type { Aisle, GroceryState, InventoryItem, PriceEntry, Recipe, WeekPlan } from "@/lib/types";

export const AISLES: { id: Aisle; label: string }[] = [
  { id: "meat", label: "Meat & poultry" },
  { id: "seafood", label: "Seafood" },
  { id: "dairy", label: "Dairy & eggs" },
  { id: "vegetables", label: "Vegetables" },
  { id: "fruits", label: "Fruit" },
  { id: "grains", label: "Grains & carbohydrates" },
  { id: "herbs", label: "Herbs & spices" },
  { id: "sauces", label: "Sauces & condiments" },
  { id: "supplements", label: "Supplements" },
  { id: "other", label: "Other" },
];

export interface GroceryLine {
  ingredientId: string;
  name: string;
  aisle: Aisle;
  needed: number; // grams for the plan
  available: number; // grams in inventory
  toBuy: number; // grams after inventory and adjustments
  adjusted: boolean;
  staple: boolean;
  unitHint?: string;
  cost?: { amount: number; kind: PriceEntry["kind"] };
  substitutedFrom?: string;
  usedIn: string[];
  checked: boolean;
}

export function buildGrocery(plan: WeekPlan | null, recipes: Recipe[], inventory: InventoryItem[], prices: PriceEntry[], state: GroceryState, currency: string, fromDate?: string) {
  const need = new Map<string, { grams: number; usedIn: Set<string>; from?: string }>();
  if (plan) {
    for (const day of plan.days) {
      if (fromDate && day.date < fromDate) continue;
      for (const m of day.meals) {
        if (m.status === "skipped" || m.status === "eaten" || m.status === "prepared") continue;
        const r = recipes.find((x) => x.id === m.recipeId);
        if (!r) continue;
        for (const ing of r.ingredients) {
          const sub = state.substitutions[ing.ingredientId];
          const id = sub ?? ing.ingredientId;
          const e = need.get(id) ?? { grams: 0, usedIn: new Set<string>(), from: sub ? ing.ingredientId : undefined };
          e.grams += (ing.grams * m.servings) / r.servings;
          e.usedIn.add(r.title);
          need.set(id, e);
        }
      }
    }
  }
  const have = new Map<string, number>();
  for (const it of inventory) if (it.ingredientId && it.grams > 0) have.set(it.ingredientId, (have.get(it.ingredientId) ?? 0) + it.grams);
  const priceMap = new Map(prices.map((p) => [p.ingredientId, p]));

  const lines: GroceryLine[] = [];
  for (const [id, e] of need) {
    if (state.removed[id]) continue;
    const ing = getIngredient(id);
    const staple = isStaple(id);
    const available = have.get(id) ?? 0;
    const base = staple ? 0 : Math.max(0, e.grams - available);
    const adjusted = state.adjustments[id] != null;
    const toBuy = adjusted ? state.adjustments[id] : base;
    const p = priceMap.get(id);
    lines.push({
      ingredientId: id,
      name: ing?.name ?? id,
      aisle: ing?.aisle ?? "other",
      needed: e.grams,
      available,
      toBuy,
      adjusted,
      staple,
      unitHint: ing?.unit && toBuy > 0 ? `≈ ${Math.max(1, Math.round(toBuy / ing.unit.grams))} × ${ing.unit.label}` : undefined,
      cost: p && p.currency === currency && toBuy > 0 ? { amount: (p.perKg * toBuy) / 1000, kind: p.kind } : undefined,
      substitutedFrom: e.from,
      usedIn: [...e.usedIn],
      checked: Boolean(state.checked[id]),
    });
  }
  lines.sort((a, b) => a.name.localeCompare(b.name));
  const total = lines.reduce((s, l) => s + (l.cost?.amount ?? 0), 0);
  const kinds = new Set(lines.filter((l) => l.cost).map((l) => l.cost!.kind));
  const unpriced = lines.filter((l) => !l.cost && l.toBuy > 0 && !l.staple).length;
  return { lines, total, kinds, unpriced };
}

export function groceryText(lines: GroceryLine[], manual: GroceryState["manual"], title: string) {
  const out = [title, ""];
  for (const a of AISLES) {
    const ls = lines.filter((l) => l.aisle === a.id && (l.toBuy > 0 || l.staple) && !l.checked);
    const ms = manual.filter((m) => m.aisle === a.id && !m.checked);
    if (!ls.length && !ms.length) continue;
    out.push(a.label.toUpperCase());
    for (const l of ls) out.push(`- ${l.name}${l.staple ? " (check pantry)" : `: ${Math.round(l.toBuy)} g`}`);
    for (const m of ms) out.push(`- ${m.name}${m.qty ? `: ${m.qty}` : ""}`);
    out.push("");
  }
  return out.join("\n");
}
