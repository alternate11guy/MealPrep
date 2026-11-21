"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ setup }: { setup: boolean }) {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label className="label" htmlFor="passcode">{setup ? "New passcode" : "Passcode"}</label>
        <input id="passcode" name="passcode" type="password" autoComplete={setup ? "new-password" : "current-password"} className="field" required autoFocus />
      </div>
      {setup && (
        <div>
          <label className="label" htmlFor="confirm">Confirm passcode</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="field" required />
        </div>
      )}
      {state?.error && <p role="alert" className="text-sm text-clay">{state.error}</p>}
      <button className="btn btn-primary btn-lg w-full" disabled={pending}>{pending ? "One moment…" : setup ? "Create passcode" : "Sign in"}</button>
    </form>
  );
}
