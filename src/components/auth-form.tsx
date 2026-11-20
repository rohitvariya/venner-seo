"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState(mode === "login" ? login : signup, undefined);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-lg font-bold text-brand-500">Venner SEO</div>
          <h1 className="mt-2 text-2xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        </div>
        {mode === "signup" && (
          <>
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="company">Company or agency</label>
              <input className="input" id="company" name="company" required />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-primary w-full">{mode === "login" ? "Sign in" : "Create account"}</SubmitButton>
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>New here? <Link className="text-brand-500" href="/signup">Create an account</Link></>
          ) : (
            <>Have an account? <Link className="text-brand-500" href="/login">Sign in</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
