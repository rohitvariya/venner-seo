"use client";

import { useActionState } from "react";
import { SubmitButton, FormMessage } from "@/components/ui";

export function GeoGridForm({
  action,
  suggestions,
  defaultKeyword,
}: {
  action: (prev: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string }>;
  suggestions: string[];
  defaultKeyword: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="gg-keyword">Search to check</label>
          <input id="gg-keyword" name="keyword" className="input" list="gg-suggestions" defaultValue={defaultKeyword} placeholder="e.g. software company in surat" />
          <datalist id="gg-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="gg-size">Grid</label>
          <select id="gg-size" name="size" className="input" defaultValue="5">
            <option value="3">3 × 3 (9 points)</option>
            <option value="5">5 × 5 (25 points)</option>
            <option value="7">7 × 7 (49 points)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="gg-radius">Distance from you</label>
          <select id="gg-radius" name="radius" className="input" defaultValue="3">
            <option value="1">1 km</option>
            <option value="3">3 km</option>
            <option value="5">5 km</option>
            <option value="10">10 km</option>
          </select>
        </div>
        <SubmitButton className="btn-primary" pending="Starting…">Check rankings</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
