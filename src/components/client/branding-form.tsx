"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui";

type Action = (prev: { error?: string; ok?: string } | undefined, form: FormData) => Promise<{ error?: string; ok?: string } | undefined>;

export function BrandingForm({ action, defaults }: { action: Action; defaults: { brandName: string; logoUrl: string; brandColor: string; reportFooter: string } }) {
  const [state, formAction] = useActionState(action, undefined);
  const [v, setV] = useState(defaults);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      <form action={formAction} className="card space-y-4">
        <div><label className="label" htmlFor="brandName">Agency name</label><input id="brandName" name="brandName" className="input" value={v.brandName} onChange={set("brandName")} /></div>
        <div>
          <label className="label" htmlFor="logoUrl">Logo link</label>
          <input id="logoUrl" name="logoUrl" className="input" value={v.logoUrl} onChange={set("logoUrl")} placeholder="https://vennerinfotech.com/wp-content/uploads/logo.png" />
          <p className="mt-1 text-xs text-slate-400">An https:// link to a PNG or SVG, e.g. from your website&apos;s media library.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1"><label className="label" htmlFor="brandColor">Brand colour</label><input id="brandColor" name="brandColor" className="input" value={v.brandColor} onChange={set("brandColor")} /></div>
          <input type="color" aria-label="Pick colour" value={/^#[0-9a-fA-F]{6}$/.test(v.brandColor) ? v.brandColor : "#4f46e5"} onChange={set("brandColor")} className="h-10 w-12 rounded border" />
        </div>
        <div>
          <label className="label" htmlFor="reportFooter">Report footer</label>
          <textarea id="reportFooter" name="reportFooter" rows={2} className="input" value={v.reportFooter} onChange={set("reportFooter")} placeholder="Questions? Call Rohit on +91 89803 17457 or reply on WhatsApp." />
        </div>
        <SubmitButton className="btn-primary">Save</SubmitButton>
        <FormMessage state={state} />
      </form>
      <div className="card h-fit space-y-2">
        <div className="text-xs text-slate-500">Preview</div>
        {v.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.logoUrl} alt="" className="h-10 max-w-[200px] object-contain" />
        ) : (
          <div className="text-lg font-bold" style={{ color: v.brandColor }}>{v.brandName}</div>
        )}
        <div className="h-1 rounded" style={{ background: v.brandColor }} />
        <div className="text-sm font-semibold">SEO report: Client name</div>
        <div className="rounded-lg p-3 text-center" style={{ background: `${v.brandColor}12` }}>
          <div className="text-xl font-semibold" style={{ color: v.brandColor }}>8</div><div className="text-xs text-slate-600">Articles published</div>
        </div>
        <p className="text-xs text-slate-500">{v.reportFooter || `Prepared by ${v.brandName}.`}</p>
      </div>
    </div>
  );
}
