import { redirect } from "next/navigation";
import { isAuthenticated, passcodeConfigured } from "@/lib/auth";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");
  const configured = await passcodeConfigured();
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rise">
        <p className="eyebrow">Private kitchen</p>
        <h1 className="display mt-2 text-5xl">Mise</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {configured ? "Enter your passcode to continue." : "Choose a passcode to protect your nutrition data. You'll use it to sign in on every device."}
        </p>
        <LoginForm setup={!configured} />
      </div>
    </main>
  );
}
