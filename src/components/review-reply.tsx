"use client";

import { useActionState } from "react";
import { sendReply } from "@/app/actions";
import { FormMessage, SubmitButton } from "./ui";

export function ReviewReply({ siteId, reviewId, draft }: { siteId: string; reviewId: string; draft: string }) {
  const [state, action] = useActionState(sendReply.bind(null, siteId, reviewId), undefined);
  return (
    <form action={action} className="space-y-2">
      <textarea name="reply" rows={3} className="input text-sm" defaultValue={draft} placeholder="Write a reply…" suppressHydrationWarning />
      <div className="flex items-center gap-3">
        <SubmitButton className="btn-primary text-xs" pending="Posting…">Post reply on Google</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
