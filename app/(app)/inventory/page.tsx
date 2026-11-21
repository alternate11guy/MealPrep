import { getInventory, getProfile, TIMEZONE } from "@/lib/store";
import { listDocs } from "@/lib/db";
import { aiAvailable } from "@/lib/services/ai";
import { INGREDIENTS } from "@/lib/nutrition/ingredients";
import { todayISO } from "@/lib/util";
import { InventoryClient } from "./inventory-client";

export const metadata = { title: "Food inventory" };

export default async function InventoryPage() {
  const [items, profile, meta] = await Promise.all([getInventory(), getProfile(), listDocs<{ kind?: string; date?: string; name?: string; grams?: number; cost?: number; currency?: string }>("meta")]);
  const today = todayISO(TIMEZONE);
  const waste = meta.filter((m) => m.kind === "waste" && m.date).sort((a, b) => b.date!.localeCompare(a.date!)).slice(0, 12);
  return (
    <InventoryClient
      items={items}
      today={today}
      currency={profile.currency}
      ai={aiAvailable()}
      waste={waste.map((w) => ({ date: w.date!, name: w.name ?? "", grams: w.grams ?? 0, cost: w.cost, currency: w.currency }))}
      catalog={INGREDIENTS.map((i) => ({ id: i.id, name: i.name, storage: i.storage, shelfDays: i.shelfDays ?? {} }))}
    />
  );
}
