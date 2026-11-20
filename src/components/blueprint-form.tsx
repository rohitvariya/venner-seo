"use client";

import { useActionState } from "react";
import { saveBlueprint } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

/** Wraps one Blueprint tab's fields in a form that saves only those fields. */
export function BlueprintForm({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  const [state, action] = useActionState(saveBlueprint.bind(null, siteId), undefined);
  return (
    <form action={action} className="space-y-5">
      {children}
      <div className="flex items-center gap-3">
        <SubmitButton pending="Saving…">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
