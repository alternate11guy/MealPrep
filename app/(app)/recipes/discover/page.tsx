import { aiAvailable } from "@/lib/services/ai";
import { REPUTABLE_DOMAINS } from "@/lib/services/discovery";
import { INGREDIENTS } from "@/lib/nutrition/ingredients";
import { DiscoverClient } from "./discover-client";

export const metadata = { title: "Find recipes online" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ q?: string; url?: string }> }) {
  const sp = await searchParams;
  return (
    <DiscoverClient
      ai={aiAvailable()}
      initialQuery={sp.q ?? ""}
      initialUrl={sp.url ?? ""}
      domains={REPUTABLE_DOMAINS}
      catalog={INGREDIENTS.map((i) => ({ id: i.id, name: i.name }))}
    />
  );
}
