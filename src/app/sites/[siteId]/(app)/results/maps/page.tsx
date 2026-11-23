import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { MapPin, MousePointerClick, Navigation, Phone, Eye } from "lucide-react";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { runGeoGridScan, syncMapsNow } from "@/app/actions";
import { LineChart } from "@/components/line-chart";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import { GeoGridMap } from "@/components/maps/geo-grid-map";
import { rankColor } from "@/lib/maps/colors";
import { GeoGridForm } from "@/components/maps/geo-grid-form";
import { dataForSeoEnabled } from "@/lib/dataforseo";
import type { SearchKeyword } from "@/lib/gbp";

type Row = typeof schema.gbpDailyMetrics.$inferSelect;
const total = (rows: Row[], f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={`text-xs ${pct >= 0 ? "text-green-700" : "text-red-700"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

export default async function MapsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ scan?: string; metric?: string }> }) {
  const { siteId } = await params;
  const sp = await searchParams;
  const { site, isClient } = await requireSite(siteId);
  const [gbp, daily, kwRow, scans, keywords] = await Promise.all([
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.type, "GBP")) }),
    db.query.gbpDailyMetrics.findMany({ where: eq(schema.gbpDailyMetrics.siteId, siteId), orderBy: asc(schema.gbpDailyMetrics.date) }),
    db.query.siteInsights.findFirst({
      where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, "maps-keywords")),
      orderBy: desc(schema.siteInsights.createdAt),
    }),
    db.query.geoGridScans.findMany({ where: eq(schema.geoGridScans.siteId, siteId), orderBy: desc(schema.geoGridScans.createdAt), limit: 20 }),
    db.query.keywords.findMany({ where: eq(schema.keywords.siteId, siteId), columns: { phrase: true }, limit: 40 }),
  ]);
  const last = daily.slice(-28);
  const prev = daily.slice(-56, -28);
  const metric = (["views", "calls", "directions", "websiteClicks"] as const).find((m) => m === sp.metric) ?? "views";
  const value = (r: Row) => (metric === "views" ? r.searchViews + r.mapsViews : r[metric]);
  const cards = [
    { key: "views", label: "Profile views", Icon: Eye, now: total(last, (r) => r.searchViews + r.mapsViews), before: total(prev, (r) => r.searchViews + r.mapsViews), sub: `${total(last, (r) => r.mapsViews).toLocaleString()} on Maps · ${total(last, (r) => r.searchViews).toLocaleString()} on Search` },
    { key: "calls", label: "Calls", Icon: Phone, now: total(last, (r) => r.calls), before: total(prev, (r) => r.calls), sub: "Taps on your call button" },
    { key: "directions", label: "Direction requests", Icon: Navigation, now: total(last, (r) => r.directions), before: total(prev, (r) => r.directions), sub: "People planning a visit" },
    { key: "websiteClicks", label: "Website clicks", Icon: MousePointerClick, now: total(last, (r) => r.websiteClicks), before: total(prev, (r) => r.websiteClicks), sub: "From your profile to your site" },
  ];
  const searchTerms = ((kwRow?.data as { keywords?: SearchKeyword[] } | null)?.keywords ?? []).slice(0, 15);

  const scan = scans.find((s) => s.id === sp.scan) ?? scans.find((s) => s.status === "DONE") ?? scans[0];
  const running = scans.some((s) => s.status === "QUEUED" || s.status === "RUNNING");
  const sameKeyword = scan ? scans.filter((s) => s.keyword === scan.keyword && s.status === "DONE").reverse() : [];
  const suggestions = [...new Set([...site.blueprint.targetSearches, ...searchTerms.map((s) => s.keyword), ...keywords.map((k) => k.phrase)])].slice(0, 30);
  const defaultKeyword = scan?.keyword ?? site.blueprint.targetSearches[0] ?? `${site.category ?? "business"} in ${site.city ?? ""}`.trim();

  return (
    <div className="space-y-6">
      <AutoRefresh active={running} intervalMs={4000} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Google Maps</h1>
          <p className="text-sm text-slate-500">How people find and contact you from your Google Business Profile, and where you rank on the map.</p>
        </div>
        {gbp && !isClient && (
          <form action={syncMapsNow.bind(null, siteId)}>
            <SubmitButton className="btn-secondary" pending="Queued">Refresh numbers</SubmitButton>
          </form>
        )}
      </div>

      {!gbp ? (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Connect Google Business Profile</p>
            <p className="text-sm text-slate-500">See your profile views, calls, direction requests and the searches people used to find you.</p>
          </div>
          {!isClient && <Link href={`/sites/${siteId}/integrations`} className="btn-primary">Connect</Link>}
        </div>
      ) : daily.length === 0 ? (
        <div className="card text-sm text-slate-500">No numbers yet. They arrive within a few minutes of connecting (Google&apos;s figures run 2-3 days behind).</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ key, label, Icon, now, before, sub }) => (
              <a key={key} href={`?metric=${key}${scan ? `&scan=${scan.id}` : ""}`} className={`card block transition hover:shadow-md ${metric === key ? "ring-2 ring-brand-500" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-slate-500"><Icon size={14} />{label} · 28 days</div>
                <div className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-semibold">{now.toLocaleString()}</span><Change now={now} before={before} /></div>
                <div className="mt-1 text-xs text-slate-400">{sub}</div>
              </a>
            ))}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">{cards.find((c) => c.key === metric)?.label} per day</h2>
            <LineChart points={daily.slice(-90).map((d) => ({ label: d.date.slice(5), value: value(d) }))} />
          </div>
          {searchTerms.length > 0 && (
            <div className="card">
              <h2 className="font-semibold">Searches that showed your profile</h2>
              <p className="mb-3 text-xs text-slate-500">Last 3 months. Google shows small numbers as &quot;under N&quot;.</p>
              <ul className="divide-y text-sm">
                {searchTerms.map((k) => (
                  <li key={k.keyword} className="flex justify-between py-1.5">
                    <span>{k.keyword}</span>
                    <span className="text-slate-500">{k.count != null ? k.count.toLocaleString() : `under ${k.below}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="card space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><MapPin size={16} />Map rankings (geo-grid)</h2>
          <p className="text-sm text-slate-500">
            Where you appear in Google Maps results for a search, checked from points all around your business. Green means top 3, the spots that get most calls.
          </p>
        </div>
        {isClient ? null : !dataForSeoEnabled() ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Map rankings use DataForSEO (each point is one paid lookup, a few rupees per 25-point check). Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to your .env and restart to turn this on.
          </p>
        ) : (
          <GeoGridForm action={runGeoGridScan.bind(null, siteId)} suggestions={suggestions} defaultKeyword={defaultKeyword} />
        )}

        {running && (
          <div className="flex items-center gap-2 text-sm text-slate-600"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />Checking rankings around you…</div>
        )}
        {scan?.status === "FAILED" && <p className="text-sm text-red-600">That check failed: {scan.error}</p>}

        {scan?.status === "DONE" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <GeoGridMap center={{ lat: scan.centerLat, lng: scan.centerLng }} points={scan.points} name={site.businessName ?? site.domain} />
            <div className="space-y-3">
              <div className="rounded-xl border p-4">
                <div className="text-xs text-slate-500">&quot;{scan.keyword}&quot;</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div><div className="text-2xl font-semibold">{scan.avgRank ?? "—"}</div><div className="text-xs text-slate-500">Average rank</div></div>
                  <div><div className="text-2xl font-semibold">{Math.round((scan.top3Share ?? 0) * 100)}%</div><div className="text-xs text-slate-500">Top 3 coverage</div></div>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {scan.size}×{scan.size} grid · {scan.radiusKm} km · {scan.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {[["1-3", 1], ["4-7", 5], ["8-10", 9], ["11-20", 15], ["Not in top 20", null]].map(([l, r]) => (
                  <li key={String(l)} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: rankColor(r as number | null) }} />{l}</li>
                ))}
              </ul>
              {sameKeyword.length > 1 && (
                <div className="rounded-xl border p-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">Average rank over time</div>
                  <ul className="space-y-0.5 text-xs">
                    {sameKeyword.map((s) => (
                      <li key={s.id} className="flex justify-between"><span>{s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><span className="font-medium">{s.avgRank}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {scans.length > 1 && (
                <div className="rounded-xl border p-3">
                  <div className="mb-1 text-xs font-medium text-slate-500">Earlier checks</div>
                  <ul className="space-y-0.5 text-xs">
                    {scans.filter((s) => s.status === "DONE").slice(0, 8).map((s) => (
                      <li key={s.id}><a href={`?scan=${s.id}`} className={`hover:underline ${s.id === scan.id ? "font-semibold text-brand-600" : "text-slate-600"}`}>{s.keyword} · {s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · avg {s.avgRank}</a></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
