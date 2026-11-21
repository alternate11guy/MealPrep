import { requireAuth } from "@/lib/auth";
import { getProfile, getTargets } from "@/lib/store";
import { Onboarding } from "./onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  await requireAuth();
  const [profile, targets] = await Promise.all([getProfile(), getTargets()]);
  return <Onboarding initialProfile={profile} initialTargets={targets} />;
}
