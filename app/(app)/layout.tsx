import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getProfile } from "@/lib/store";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile.onboarded) redirect("/onboarding");
  return <Shell demo={profile.demo}>{children}</Shell>;
}
