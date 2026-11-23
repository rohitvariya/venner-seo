import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { AlertTriangle, ChevronRight, Palette, Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { logout } from "@/app/actions";
import { AddSiteForm } from "@/components/add-site-form";

type Row = {
  id: string;
  domain: string;
  name: string;
  setupDone: boolean;
  health: number | null;
  critical: number;
  toReview: number;
  publishedMonth: number;
  failed: number;
  clientNotes: number;
  unreplied: number;
  lowUnreplied: number;
  rating: number | null;
  clicks: number | null;
  prevClicks: number | null;
  calls: number | null;
  aiShare: number | null;
  website: boolean;
  gsc: boolean;
  gbp: boolean;
  clients: number;
};

const pct = (now: number | null, before: number | null) => (now === null || !before ? null : Math.round(((now - before) / before) * 100));

/** Problems first: things that hurt the client today, then work waiting on us. */
function attention(r: Row) {
  const items: { label: string; tone: "red" | "amber" | "blue" }[] = [];
  if (!r.setupDone) items.push({ label: "Setup unfinished", tone: "amber" });
  if (r.clientNotes) items.push({ label: `${r.clientNotes} change request${r.clientNotes > 1 ? "s" : ""}`, tone: "red" });
  if (r.lowUnreplied) items.push({ label: `${r.lowUnreplied} unhappy review${r.lowUnreplied > 1 ? "s" : ""}`, tone: "red" });
  if (r.failed) items.push({ label: `${r.failed} failed`, tone: "red" });
  if (r.critical) items.push({ label: `${r.critical} critical site issue${r.critical > 1 ? "s" : ""}`, tone: "red" });
  if (r.setupDone && !r.website) items.push({ label: "Website not connected", tone: "amber" });
  if (r.setupDone && !r.gsc) items.push({ label: "No Search Console", tone: "amber" });
  if (r.toReview) items.push({ label: `${r.toReview} to review`, tone: "blue" });
  const ch = pct(r.clicks, r.prevClicks);
  if (ch !== null && ch <= -20) items.push({ label: `Clicks ${ch}%`, tone: "red" });
  return items;
}
const weight = (r: Row) => attention(r).reduce((s, a) => s + (a.tone === "red" ? 10 : a.tone === "amber" ? 3 : 1), 0);
const TONE = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string; add?: string }> }) {
  const sp = await searchParams;
  const { user, workspace, isClient, clientSiteIds } = await requireUser();

  if (isClient) {
    const mine = clientSiteIds!.length
      ? await db.query.sites.findMany({ where: inArray(schema.sites.id, clientSiteIds!), columns: { id: true, domain: true, businessName: true } })
      : [];
    if (mine.length === 1) redirect(`/sites/${mine[0].id}`);
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Your websites</h1>
          <form action={logout}><button className="btn-secondary text-sm">Sign out</button></form>
        </div>
        {mine.length === 0 && <p className="card text-sm text-slate-500">You don&apos;t have access to any website yet. Ask {workspace.brandName ?? workspace.name} to invite you.</p>}
        <div className="space-y-2">
          {mine.map((s) => (
            <Link key={s.id} href={`/sites/${s.id}`} className="card flex items-center justify-between hover:border-brand-500">
              <div><div className="font-medium">{s.businessName ?? s.domain}</div><div className="text-sm text-slate-500">{s.domain}</div></div>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const S = schema.sites;
  const A = schema.articles;
  const R = schema.reviews;
  const sites = await db.query.sites.findMany({ where: eq(S.workspaceId, workspace.id), columns: { id: true, domain: true, businessName: true, onboardingStep: true } });
  const ids = sites.map((s) => s.id);
  const rows: Row[] = [];
  if (ids.length) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const d28 = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);
    const d56 = new Date(Date.now() - 56 * 86400_000).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400_000);
    const n = sql<number>`count(*)::int`;
    const [art, rev, audits, gsc, gbp, ai, integ, clients] = await Promise.all([
      db.select({
        siteId: A.siteId,
        toReview: sql<number>`count(*) filter (where ${A.status} = 'REVIEW')::int`,
        failed: sql<number>`count(*) filter (where ${A.status} = 'FAILED')::int`,
        publishedMonth: sql<number>`count(*) filter (where ${A.status} = 'PUBLISHED' and ${A.publishedAt} >= ${monthStart})::int`,
        clientNotes: sql<number>`count(*) filter (where ${A.clientNote} is not null)::int`,
      }).from(A).where(inArray(A.siteId, ids)).groupBy(A.siteId),
      db.select({
        siteId: R.siteId,
        unreplied: sql<number>`count(*) filter (where ${R.replyText} is null)::int`,
        lowUnreplied: sql<number>`count(*) filter (where ${R.replyText} is null and ${R.rating} <= 3)::int`,
        rating: sql<number>`round(avg(${R.rating})::numeric, 1)::float`,
      }).from(R).where(inArray(R.siteId, ids)).groupBy(R.siteId),
      db.execute<{ site_id: string; score: number; critical: number }>(sql`
        select distinct on (site_id) site_id, score,
          (select count(*)::int from jsonb_array_elements(issues) i where i->>'severity' = 'critical') as critical
        from site_audits where status = 'DONE' and site_id in ${ids}
        order by site_id, created_at desc`),
      db.select({
        siteId: schema.gscDailyMetrics.siteId,
        clicks: sql<number>`coalesce(sum(${schema.gscDailyMetrics.clicks}) filter (where ${schema.gscDailyMetrics.date} >= ${d28}), 0)::int`,
        prev: sql<number>`coalesce(sum(${schema.gscDailyMetrics.clicks}) filter (where ${schema.gscDailyMetrics.date} < ${d28}), 0)::int`,
      }).from(schema.gscDailyMetrics).where(and(inArray(schema.gscDailyMetrics.siteId, ids), gte(schema.gscDailyMetrics.date, d56))).groupBy(schema.gscDailyMetrics.siteId),
      db.select({ siteId: schema.gbpDailyMetrics.siteId, calls: sql<number>`coalesce(sum(${schema.gbpDailyMetrics.calls}), 0)::int` })
        .from(schema.gbpDailyMetrics).where(and(inArray(schema.gbpDailyMetrics.siteId, ids), gte(schema.gbpDailyMetrics.date, d28))).groupBy(schema.gbpDailyMetrics.siteId),
      db.select({ siteId: schema.aiChecks.siteId, total: n, mentioned: sql<number>`count(*) filter (where ${schema.aiChecks.mentioned})::int` })
        .from(schema.aiChecks).where(and(inArray(schema.aiChecks.siteId, ids), gte(schema.aiChecks.checkedAt, d30))).groupBy(schema.aiChecks.siteId),
      db.query.integrations.findMany({ where: inArray(schema.integrations.siteId, ids), columns: { siteId: true, type: true } }),
      db.select({ siteId: schema.clientSiteAccess.siteId, n }).from(schema.clientSiteAccess).where(inArray(schema.clientSiteAccess.siteId, ids)).groupBy(schema.clientSiteAccess.siteId),
    ]);
    const by = <T extends { siteId: string }>(list: T[]) => new Map(list.map((x) => [x.siteId, x]));
    const artM = by(art), revM = by(rev), gscM = by(gsc), gbpM = by(gbp), aiM = by(ai), cliM = by(clients);
    const audM = new Map(audits.rows.map((a) => [a.site_id, a]));
    for (const s of sites) {
      const types = new Set(integ.filter((i) => i.siteId === s.id).map((i) => i.type));
      const g = gscM.get(s.id);
      const a = aiM.get(s.id);
      rows.push({
        id: s.id, domain: s.domain, name: s.businessName ?? s.domain, setupDone: s.onboardingStep === "DONE",
        health: audM.get(s.id)?.score ?? null, critical: audM.get(s.id)?.critical ?? 0,
        toReview: artM.get(s.id)?.toReview ?? 0, publishedMonth: artM.get(s.id)?.publishedMonth ?? 0, failed: artM.get(s.id)?.failed ?? 0,
        clientNotes: artM.get(s.id)?.clientNotes ?? 0,
        unreplied: revM.get(s.id)?.unreplied ?? 0, lowUnreplied: revM.get(s.id)?.lowUnreplied ?? 0, rating: revM.get(s.id)?.rating ?? null,
        clicks: types.has("GSC") ? (g?.clicks ?? 0) : null, prevClicks: types.has("GSC") ? (g?.prev ?? 0) : null,
        calls: gbpM.get(s.id)?.calls ?? null,
        aiShare: a?.total ? Math.round((a.mentioned / a.total) * 100) : null,
        website: types.has("WORDPRESS") || types.has("SHOPIFY") || types.has("CUSTOM"), gsc: types.has("GSC"), gbp: types.has("GBP"),
        clients: cliM.get(s.id)?.n ?? 0,
      });
    }
  }
  const q = (sp.q ?? "").toLowerCase();
  const view = sp.view === "all" ? "all" : "attention";
  let shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.domain.includes(q));
  if (view === "attention") shown = shown.sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
  else shown = shown.sort((a, b) => a.name.localeCompare(b.name));
  const total = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const needing = rows.filter((r) => attention(r).some((x) => x.tone !== "blue")).length;
  const showAdd = sp.add === "1" || rows.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspace.logoUrl} alt="" className="h-8 max-w-[160px] object-contain" />
            ) : (
              <span className="text-lg font-bold tracking-tight text-brand-600">venner<span className="text-slate-900">SEO</span></span>
            )}
            <span className="text-sm text-slate-400">/</span>
            <span className="font-semibold">{workspace.brandName ?? workspace.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/sites/branding" className="btn-secondary"><Palette size={14} />Branding</Link>
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
            <form action={logout}><button className="btn-secondary">Sign out</button></form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Clients</h1>
            <p className="text-sm text-slate-500">Every client at a glance. Problems first.</p>
          </div>
          <Link href={showAdd && rows.length ? "/sites" : "/sites?add=1"} className="btn-primary"><Plus size={15} />Add client</Link>
        </div>

        {showAdd && (
          <div className="card max-w-md">
            <h2 className="mb-4 font-semibold">Add a client website</h2>
            <AddSiteForm />
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Clients", rows.length, ""],
                ["Need attention", needing, needing ? "text-red-600" : ""],
                ["Articles to review", total((r) => r.toReview), ""],
                ["Unreplied reviews", total((r) => r.unreplied), ""],
                ["Published this month", total((r) => r.publishedMonth), ""],
              ].map(([label, value, cls]) => (
                <div key={String(label)} className="card">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className={`mt-1 text-3xl font-semibold ${cls}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[["attention", "Needs attention first"], ["all", "A to Z"]].map(([v, l]) => (
                <Link key={v} href={`?view=${v}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
                  className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{l}</Link>
              ))}
              <form className="relative ml-auto">
                <input type="hidden" name="view" value={view} />
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input name="q" defaultValue={sp.q} placeholder="Search clients" className="input w-64 py-1.5 pl-8" />
              </form>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Client</th>
                    <th className="px-2 py-2.5 font-medium">Needs attention</th>
                    <th className="px-2 py-2.5 text-right font-medium">Health</th>
                    <th className="px-2 py-2.5 text-right font-medium">Clicks 28d</th>
                    <th className="px-2 py-2.5 text-right font-medium">Calls 28d</th>
                    <th className="px-2 py-2.5 text-right font-medium">AI mentions</th>
                    <th className="px-2 py-2.5 text-right font-medium">Reviews</th>
                    <th className="px-2 py-2.5 text-right font-medium">Live this month</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const att = attention(r);
                    const ch = pct(r.clicks, r.prevClicks);
                    const href = r.setupDone ? `/sites/${r.id}` : `/sites/${r.id}/onboarding`;
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <Link href={href} className="font-medium hover:text-brand-600">{r.name}</Link>
                          <div className="text-xs text-slate-500">{r.domain}{r.clients ? ` · ${r.clients} client login${r.clients > 1 ? "s" : ""}` : ""}</div>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex max-w-[340px] flex-wrap gap-1">
                            {att.length === 0 ? <span className="text-xs text-green-700">All good</span> : att.slice(0, 4).map((a) => (
                              <span key={a.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${TONE[a.tone]}`}>
                                {a.tone === "red" && <AlertTriangle size={10} />}{a.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right">
                          {r.health === null ? <span className="text-slate-300">—</span> : (
                            <Link href={`/sites/${r.id}/results/health`} className={`font-semibold ${r.health >= 80 ? "text-green-700" : r.health >= 50 ? "text-amber-600" : "text-red-600"}`}>{r.health}</Link>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {r.clicks === null ? <span className="text-xs text-slate-300">not connected</span> : (
                            <><span className="font-medium">{r.clicks.toLocaleString()}</span>{ch !== null && <span className={`ml-1 text-[11px] ${ch >= 0 ? "text-green-700" : "text-red-600"}`}>{ch >= 0 ? "▲" : "▼"}{Math.abs(ch)}%</span>}</>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">{r.calls === null ? <span className="text-slate-300">—</span> : r.calls}</td>
                        <td className="px-2 py-3 text-right">{r.aiShare === null ? <span className="text-slate-300">—</span> : `${r.aiShare}%`}</td>
                        <td className="px-2 py-3 text-right">
                          {r.rating === null ? <span className="text-slate-300">—</span> : <>{r.rating}<span className="text-amber-500">★</span>{r.unreplied > 0 && <span className="ml-1 text-[11px] text-slate-500">({r.unreplied} to reply)</span>}</>}
                        </td>
                        <td className="px-2 py-3 text-right">{r.publishedMonth}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            {r.setupDone && <Link href={`/sites/${r.id}/results/report`} className="btn-secondary px-2 py-1 text-xs">Report</Link>}
                            <Link href={href} className="btn-secondary px-2 py-1 text-xs">Open</Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No clients match.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
