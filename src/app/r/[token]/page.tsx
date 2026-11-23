import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildReport } from "@/lib/report";
import { ClientReport } from "@/components/client/client-report";
import { MonthPicker } from "@/components/client/month-picker";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SEO report", robots: { index: false, follow: false } };

/** Public, no-login client report (link created by the agency; regenerating it revokes this one). */
export default async function PublicReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ month?: string }> }) {
  const { token } = await params;
  const { month } = await searchParams;
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) notFound();
  const site = await db.query.sites.findFirst({ where: eq(schema.sites.reportToken, token), columns: { id: true } });
  if (!site) notFound();
  const data = await buildReport(site.id, month);
  if (!data) notFound();
  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <MonthPicker current={data.range.key} base={`/r/${token}`} />
        <PrintButton />
      </div>
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl shadow-sm print:shadow-none">
        <ClientReport data={data} />
      </div>
    </div>
  );
}
