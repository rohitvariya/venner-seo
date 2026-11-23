"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui";

type Suggest = (prev: { error?: string; text?: string } | undefined) => Promise<{ error?: string; text?: string }>;
type Save = (prev: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string }>;

export function DescriptionEditor({ current, suggest, save }: { current: string; suggest: Suggest; save: Save }) {
  const [value, setValue] = useState(current);
  const [saved, saveAction] = useActionState(save, undefined);
  const [suggested, suggestAction, suggesting] = useActionState(async (p: { error?: string; text?: string } | undefined) => {
    const r = await suggest(p);
    if (r.text) setValue(r.text);
    return r;
  }, undefined);
  return (
    <div className="space-y-2">
      <form action={saveAction} className="space-y-2">
        <textarea name="description" rows={6} className="input text-sm" value={value} onChange={(e) => setValue(e.target.value)} maxLength={750}
          placeholder="Describe what you do, who you help and where." />
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs ${value.length > 750 ? "text-red-600" : value.length >= 600 ? "text-green-700" : "text-slate-400"}`}>{value.length}/750</span>
          <button type="submit" formAction={suggestAction} className="btn-secondary text-sm" disabled={suggesting}>
            <Sparkles size={14} />{suggesting ? "Writing…" : "Write it for me"}
          </button>
          <SubmitButton className="btn-primary text-sm" pending="Updating…">Update on Google</SubmitButton>
        </div>
      </form>
      <FormMessage state={saved} />
      {suggested?.error && <p className="text-sm text-red-600">{suggested.error}</p>}
      {suggested?.text && !saved && <p className="text-xs text-slate-500">Suggestion filled in above. Edit if you like, then click Update on Google.</p>}
    </div>
  );
}
