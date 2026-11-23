import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { requireSite } from "@/lib/auth";
import { buildReport } from "@/lib/report";
import { createReportLink, disableReportLink, startGrow } from "@/app/actions";
import { ClientReport } from "@/components/client/client-report";
import { MonthPicker } from "@/components/client/month-picker";
import { PrintButton } from "@/components/print-button";
import { SubmitButton } from "@/components/ui";
import { latestGrow } from "@/lib/grow/jobs";
import { AutoRefresh } from "@/components/ui";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { siteId } = await params;
  const { month } = await searchParams;
  const { site, isClient } = await requireSite(siteId);
  const data = await buildReport(siteId, month);
  if (!data) notFound();
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = site.reportToken ? `${appUrl}/r/${site.reportToken}?month=${data.range.key}` : null;
  const summary = isClient ? null : await latestGrow(siteId, "report");

  return (
    <div className="space-y-5">
      <AutoRefresh active={!!summary?.running} intervalMs={4000} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">{isClient ? "Monthly report" : "Client report"}</h1>
          <p className="text-sm text-slate-500">{isClient ? "What was done for you and what it achieved." : "Branded report to send to your client. Pick a month, then share the link or save as PDF."}</p>
        </div>
        <PrintButton />
      </div>
      <MonthPicker current={data.range.key} base={`/sites/${siteId}/results/report`} />

      {!isClient && (
        <div className="card space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium"><Link2 size={16} />Share link</div>
            <div className="flex gap-2">
              {!data.summary && (
                <form action={startGrow.bind(null, siteId, "report")}>
                  <SubmitButton className="btn-secondary text-xs" pending="Writing…">{summary?.running ? "Writing summary…" : "Add AI summary"}</SubmitButton>
                </form>
              )}
              <form action={createReportLink.bind(null, siteId)}>
                <SubmitButton className="btn-secondary text-xs" pending="…">{link ? "New link (old one stops working)" : "Create share link"}</SubmitButton>
              </form>
              {link && <form action={disableReportLink.bind(null, siteId)}><SubmitButton className="btn-secondary text-xs" pending="…">Turn off link</SubmitButton></form>}
            </div>
          </div>
          {link ? (
            <div className="space-y-1">
              <code className="block truncate rounded-lg bg-slate-50 p-2 text-xs">{link}</code>
              <p className="text-xs text-slate-500">
                Anyone with this link can see this client&apos;s reports (no login). Send it by WhatsApp or email.
                {appUrl.includes("localhost") && " It only works from other devices once Venner SEO is online."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Create a link to send this report to your client without them needing a login.</p>
          )}
          <p className="text-xs text-slate-400">Logo, colour and footer come from <Link href="/sites/branding" className="text-brand-600">Agency branding</Link>.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm print:border-0 print:shadow-none">
        <ClientReport data={data} />
      </div>
    </div>
  );
}
