import { desc, eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { runSiteAudit } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import type { AuditSeverity } from "@/lib/schema";

const SEV: Record<AuditSeverity, { label: string; cls: string; Icon: typeof XCircle }> = {
  critical: { label: "Critical", cls: "bg-red-50 text-red-700", Icon: XCircle },
  warning: { label: "Warning", cls: "bg-amber-50 text-amber-700", Icon: AlertTriangle },
  notice: { label: "Notice", cls: "bg-slate-100 text-slate-600", Icon: Info },
};

function scoreColor(s: number) {
  return s >= 80 ? "#16a34a" : s >= 50 ? "#d97706" : "#dc2626";
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36" role="img" aria-label={`Score ${score} out of 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 30, fontWeight: 700 }}>{score}</text>
      <text x="64" y="82" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 12 }}>out of 100</text>
    </svg>
  );
}

export default async function HealthPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ sev?: string }> }) {
  const { siteId } = await params;
  const { sev } = await searchParams;
  const { site, isClient } = await requireSite(siteId);
  const audits = await db.query.siteAudits.findMany({
    where: eq(schema.siteAudits.siteId, siteId),
    orderBy: desc(schema.siteAudits.createdAt),
    limit: 12,
  });
  const running = audits[0] && (audits[0].status === "QUEUED" || audits[0].status === "RUNNING");
  const done = audits.find((a) => a.status === "DONE");
  const failed = audits[0]?.status === "FAILED" ? audits[0] : null;
  const prev = done ? audits.filter((a) => a.status === "DONE" && a.id !== done.id)[0] : undefined;
  const history = audits.filter((a) => a.status === "DONE").reverse();
  const issues = done?.issues ?? [];
  const counts = { critical: 0, warning: 0, notice: 0 } as Record<AuditSeverity, number>;
  for (const i of issues) counts[i.severity]++;
  const shown = sev && sev in counts ? issues.filter((i) => i.severity === sev) : issues;
  const run = runSiteAudit.bind(null, siteId);

  return (
    <div className="space-y-6">
      <AutoRefresh active={!!running} intervalMs={4000} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Website health</h1>
          <p className="text-sm text-slate-500">
            Technical and on-page checks for {site.domain}. Fix these and Google can find, understand and rank your pages.
          </p>
        </div>
        {!isClient && (
          <form action={run}>
            <SubmitButton className="btn-primary" pending="Starting…">{done || failed ? "Check again" : "Check my website"}</SubmitButton>
          </form>
        )}
      </div>

      {running && (
        <div className="card flex items-center gap-3 text-sm text-slate-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          Checking up to 40 pages, links and mobile speed. This takes 1-3 minutes.
        </div>
      )}
      {failed && !running && <div className="card border-red-200 bg-red-50 text-sm text-red-700">Last check failed: {failed.error}</div>}

      {!done && !running && !failed && (
        <div className="card py-10 text-center">
          <p className="font-medium">No health check yet</p>
          <p className="mt-1 text-sm text-slate-500">We&apos;ll check every page for problems that stop you ranking, and explain how to fix each one.</p>
        </div>
      )}

      {done && (
        <>
          <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
            <div className="card flex flex-col items-center justify-center px-8">
              <ScoreRing score={done.score ?? 0} />
              {prev?.score != null && done.score != null && (
                <p className={`mt-1 text-xs ${done.score >= prev.score ? "text-green-700" : "text-red-700"}`}>
                  {done.score >= prev.score ? "▲" : "▼"} {Math.abs(done.score - prev.score)} since last check
                </p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Checked {done.finishedAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {done.stats?.pagesChecked ?? 0} pages
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(["critical", "warning", "notice"] as const).map((k) => {
                const { label, cls, Icon } = SEV[k];
                return (
                  <a key={k} href={`?sev=${sev === k ? "" : k}`} className={`card block transition hover:shadow-md ${sev === k ? "ring-2 ring-brand-500" : ""}`}>
                    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}><Icon size={12} />{label}</div>
                    <div className="mt-2 text-3xl font-semibold">{counts[k]}</div>
                    <div className="text-xs text-slate-500">{k === "critical" ? "Fix these first" : k === "warning" ? "Worth fixing soon" : "Nice to have"}</div>
                  </a>
                );
              })}
              <div className="card">
                <div className="text-xs text-slate-500">Mobile speed</div>
                <div className="mt-2 text-3xl font-semibold">{done.stats?.mobileScore ?? "—"}</div>
                <div className="text-xs text-slate-500">
                  {done.stats?.lcpMs
                    ? `Main content shows in ${(done.stats.lcpMs / 1000).toFixed(1)}s`
                    : done.stats?.mobileScore == null
                      ? "Couldn't measure: Google limits free checks. Add a free PAGESPEED_API_KEY to .env."
                      : "PageSpeed score, homepage"}
                </div>
              </div>
            </div>
          </div>

          {history.length > 1 && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Score over time</h2>
              <div className="flex h-24 items-end gap-2">
                {history.map((a) => (
                  <div key={a.id} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full max-w-10 rounded-t" style={{ height: `${a.score ?? 0}%`, background: scoreColor(a.score ?? 0) }} title={`${a.score}`} />
                    <span className="text-[10px] text-slate-400">{a.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-0">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="font-semibold">{sev ? `${SEV[sev as AuditSeverity]?.label ?? ""} problems` : "Problems found"} ({shown.length})</h2>
              {sev && <a href="?" className="text-sm text-brand-600">Show all</a>}
            </div>
            {shown.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing to fix here. 🎉</p>}
            <ul className="divide-y">
              {shown.map((i) => {
                const { label, cls, Icon } = SEV[i.severity];
                return (
                  <li key={i.id}>
                    <details className="group px-5 py-4">
                      <summary className="flex cursor-pointer list-none items-center gap-3">
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}><Icon size={12} />{label}</span>
                        <span className="flex-1 font-medium">{i.title}</span>
                        <span className="text-xs text-slate-400 group-open:hidden">How to fix ›</span>
                      </summary>
                      <div className="mt-3 space-y-3 pl-1 text-sm">
                        <p className="text-slate-600"><span className="font-medium text-slate-800">Why it matters: </span>{i.why}</p>
                        <p className="rounded-lg bg-brand-50 p-3 text-slate-700"><span className="font-medium">How to fix: </span>{i.fix}</p>
                        {i.pages.length > 0 && i.pages[0] !== "site" && (
                          <div>
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                              Affected{i.count > i.pages.length ? ` (first ${i.pages.length} of ${i.count})` : ""}
                            </p>
                            <ul className="space-y-0.5">
                              {i.pages.map((p) => {
                                const url = p.split(" (")[0];
                                return (
                                  <li key={p} className="truncate text-xs">
                                    <a href={url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{url}</a>
                                    <span className="text-slate-400">{p.slice(url.length)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>

          {(done.stats?.passed.length ?? 0) > 0 && !sev && (
            <details className="card">
              <summary className="cursor-pointer font-semibold">Passed checks ({done.stats!.passed.length})</summary>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {done.stats!.passed.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-slate-600"><CheckCircle2 size={14} className="text-green-600" />{p}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
