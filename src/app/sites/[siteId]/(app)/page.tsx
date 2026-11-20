import Link from "next/link";
import { requireSite } from "@/lib/auth";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { syncGscNow } from "@/app/actions";
import { LineChart } from "@/components/line-chart";
import { StatusBadge } from "@/components/badges";
import { SubmitButton } from "@/components/ui";

function sum<T>(rows: T[], f: (r: T) => number) {
  return rows.reduce((s, r) => s + f(r), 0);
}

export default async function OverviewPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSite(siteId);
  const { gscDailyMetrics: D, gscQueryMetrics: Q, integrations: I, articles: A } = schema;
  const [daily, queries, gsc, counts, upcoming] = await Promise.all([
    db.query.gscDailyMetrics.findMany({ where: eq(D.siteId, siteId), orderBy: asc(D.date) }),
    db.query.gscQueryMetrics.findMany({ where: eq(Q.siteId, siteId), orderBy: [desc(Q.clicks), desc(Q.impressions)], limit: 15 }),
    db.query.integrations.findFirst({ where: and(eq(I.siteId, siteId), eq(I.type, "GSC")) }),
    db.select({ status: A.status, n: sql<number>`count(*)::int` }).from(A).where(eq(A.siteId, siteId)).groupBy(A.status),
    db.query.articles.findMany({
      where: and(eq(A.siteId, siteId), inArray(A.status, ["REVIEW", "SCHEDULED", "IDEA", "WRITING"])),
      orderBy: [asc(A.scheduledAt), asc(A.plannedFor)],
      limit: 6,
    }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const last28 = daily.slice(-28);
  const prev28 = daily.slice(-56, -28);
  const clicks = sum(last28, (d) => d.clicks);
  const prevClicks = sum(prev28, (d) => d.clicks);
  const impressions = sum(last28, (d) => d.impressions);
  const avgPos = last28.length ? sum(last28, (d) => d.position) / last28.length : null;
  const change = prevClicks ? Math.round(((clicks - prevClicks) / prevClicks) * 100) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Clicks (28 days)" value={gsc ? clicks.toLocaleString() : "—"} sub={change != null ? `${change >= 0 ? "+" : ""}${change}% vs previous` : undefined} />
        <Stat label="Impressions (28 days)" value={gsc ? impressions.toLocaleString() : "—"} />
        <Stat label="Avg. position" value={avgPos ? avgPos.toFixed(1) : "—"} />
        <Stat label="Articles published" value={String(count("PUBLISHED"))} sub={`${count("REVIEW")} waiting for review`} />
      </div>

      {!gsc ? (
        <div className="card flex items-center justify-between">
          <div>
            <div className="font-medium">Connect Google Search Console</div>
            <p className="text-sm text-slate-500">See clicks, impressions and the searches you appear for.</p>
          </div>
          <Link href={`/sites/${siteId}/integrations`} className="btn-primary">Connect</Link>
        </div>
      ) : (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Clicks from Google, last 90 days</h2>
            <form action={syncGscNow.bind(null, siteId)}><SubmitButton className="btn-secondary" pending="Queued">Refresh</SubmitButton></form>
          </div>
          <LineChart points={daily.map((d) => ({ label: d.date.slice(5), value: d.clicks }))} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Top searches (28 days)</h2>
          {queries.length === 0 ? (
            <p className="text-sm text-slate-400">No search data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr><th className="pb-2">Query</th><th className="pb-2 text-right">Clicks</th><th className="pb-2 text-right">Impr.</th><th className="pb-2 text-right">Pos.</th></tr>
              </thead>
              <tbody>
                {queries.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">{q.query}</td>
                    <td className="py-1.5 text-right">{q.clicks}</td>
                    <td className="py-1.5 text-right">{q.impressions}</td>
                    <td className="py-1.5 text-right">{q.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Coming up</h2>
            <Link href={`/sites/${siteId}/content`} className="text-sm text-brand-500">All content →</Link>
          </div>
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link href={`/sites/${siteId}/content/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50">
                  <span className="truncate text-sm">{a.title}</span>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
            {upcoming.length === 0 && <li className="text-sm text-slate-400">Nothing planned. Plan more from the Content page.</li>}
          </ul>
        </div>
      </div>
      <p className="text-xs text-slate-400">{site.domain} · {site.articlesPerMonth} articles per month</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
