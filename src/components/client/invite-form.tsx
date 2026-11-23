"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui";

type State = { error?: string; ok?: string; link?: string } | undefined;

export function InviteForm({ action }: { action: (prev: State, form: FormData) => Promise<State> }) {
  const [state, formAction] = useActionState(action, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="name" className="input" placeholder="Client's name" />
        <input name="email" type="email" className="input" placeholder="client@theirbusiness.com" required />
        <SubmitButton className="btn-primary" pending="Creating…">Create invite link</SubmitButton>
      </form>
      <FormMessage state={state} />
      {state?.link && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{state.link}</code>
          <button type="button" className="btn-secondary text-xs" onClick={() => { navigator.clipboard.writeText(state.link!); setCopied(true); }}>
            <Copy size={12} />{copied ? "Copied" : "Copy"}
          </button>
          <a className="btn-secondary text-xs" target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`Here's your login for your SEO dashboard: ${state.link}`)}`}>WhatsApp</a>
        </div>
      )}
    </div>
  );
}
