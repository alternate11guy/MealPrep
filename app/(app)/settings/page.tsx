import { getPrices, getProfile, getTargets } from "@/lib/store";
import { aiAvailable } from "@/lib/services/ai";
import { getIngredient } from "@/lib/nutrition/ingredients";
import { SR28_CITATION } from "@/lib/nutrition/foods";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [profile, targets, prices] = await Promise.all([getProfile(), getTargets(), getPrices()]);
  return (
    <SettingsClient
      profile={profile}
      targets={targets}
      prices={prices.map((p) => ({ ...p, name: getIngredient(p.ingredientId)?.name ?? p.ingredientId })).sort((a, b) => a.name.localeCompare(b.name))}
      integrations={{
        anthropic: aiAvailable(),
        database: process.env.DATABASE_URL ? "postgres" : "embedded",
        fdcKey: Boolean(process.env.USDA_FDC_API_KEY),
        passcodeFromEnv: Boolean(process.env.APP_PASSCODE),
      }}
      citation={SR28_CITATION}
    />
  );
}
