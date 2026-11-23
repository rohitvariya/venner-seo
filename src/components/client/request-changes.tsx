"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui";

type Action = (prev: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string } | undefined>;

export function RequestChanges({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <textarea name="note" rows={4} className="input text-sm" placeholder="What should be changed? e.g. 'We don't offer this service any more' or 'Mention our 10-year warranty'." />
      <SubmitButton className="btn-secondary w-full" pending="Sending…">Ask for changes</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
