import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <Link href="/login" className="text-lg font-bold text-brand-500">Venner SEO</Link>
      <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-[15px] leading-7 text-slate-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
      <p className="mt-12 border-t pt-6 text-sm text-slate-500">
        Venner Infotech &amp; Marketing Solution, Surat, Gujarat, India ·{" "}
        <Link href="/privacy" className="underline">Privacy</Link> ·{" "}
        <Link href="/terms" className="underline">Terms</Link>
      </p>
    </div>
  );
}
