"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui";

type Action = (prev: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string } | undefined>;

export function AcceptInviteForm({ action, email, name, existing }: { action: Action; email: string; name: string; existing: boolean }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label">Email</label>
        <input className="input bg-slate-50" value={email} readOnly />
      </div>
      {!existing && (
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" className="input" defaultValue={name} autoComplete="name" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">{existing ? "Your password" : "Choose a password"}</label>
        <input id="password" name="password" type="password" className="input" minLength={8} required autoComplete={existing ? "current-password" : "new-password"} />
        {!existing && <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>}
      </div>
      <SubmitButton className="btn-primary w-full" pending="Setting up…">{existing ? "Sign in and continue" : "Create my login"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
