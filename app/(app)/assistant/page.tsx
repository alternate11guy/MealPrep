import { aiAvailable } from "@/lib/services/ai";
import { getProfile, TIMEZONE } from "@/lib/store";
import { todayISO } from "@/lib/util";
import { AssistantClient } from "./assistant-client";

export const metadata = { title: "AI nutrition assistant" };

export default async function AssistantPage() {
  const profile = await getProfile();
  return <AssistantClient ai={aiAvailable()} today={todayISO(TIMEZONE)} name={profile.name} />;
}
