import type { ClientReportData } from "@/lib/report";

function Change({ now, before, better = "up", unit = "" }: { now: number | null; before: number | null; better?: "up" | "down"; unit?: string }) {
  if (now === null || before === null) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <div className="text-xs text-slate-400">Same as the month before</div>;
  const good = better === "up" ? diff > 0 : diff < 0;
  return <div className={`text-xs ${good ? "text-green-700" : "text-red-700"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString()}{unit} vs the month before</div>;
}

/** The branded monthly report, shared by the in-app page and the public link. Printable. */
export function ClientReport({ data }: { data: ClientReportData }) {
  const { agency, site, range, work } = data;
  // Health and map rank have their own cards further down.
  const metrics = data.metrics.filter((m) => m.now !== null && !(m.now === 0 && !m.before) && !/^(Website health|Map rank|Average map rank)/.test(m.label));
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div className="report mx-auto max-w-4xl space-y-6 bg-white p-6 print:p-0 sm:p-10" style={{ ["--brand" as string]: agency.color }}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6" style={{ borderColor: agency.color }}>
        <div>
          {agency.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agency.logoUrl} alt={agency.name} className="mb-3 h-10 max-w-[200px] object-contain" />
          ) : (
            <div className="mb-3 text-xl font-bold" style={{ color: agency.color }}>{agency.name}</div>
          )}
          <h1 className="text-3xl font-semibold">SEO report: {site.name}</h1>
          <p className="mt-1 text-slate-500">{range.label}{range.partial ? ` (so far, to ${fmt(range.to)})` : ""} · {site.domain}</p>
        </div>
      </header>

      {data.summary && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Summary</h2>
          <p className="leading-relaxed text-slate-700">{data.summary.summary}</p>
          {data.summary.wins.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-slate-700">{data.summary.wins.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
        </section>
      )}

      {metrics.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Results</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-200 p-4 break-inside-avoid">
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className="mt-1 text-2xl font-semibold">{m.now?.toLocaleString()}{m.unit}</div>
                <Change now={m.now} before={m.before} better={m.better} unit={m.unit} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="break-inside-avoid">
        <h2 className="mb-3 text-lg font-semibold">Work done this month</h2>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Articles published", work.articles.length], ["Google posts", work.googlePosts], ["Social posts", work.socialPosts], ["Review replies", work.replies]].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl p-4 text-center" style={{ background: `${agency.color}12` }}>
              <div className="text-2xl font-semibold" style={{ color: agency.color }}>{v}</div>
              <div className="text-xs text-slate-600">{l}</div>
            </div>
          ))}
        </div>
        {work.articles.length > 0 && (
          <ul className="divide-y rounded-xl border border-slate-200">
            {work.articles.map((a) => (
              <li key={a.title} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{a.title}</span>
                <span className="flex shrink-0 items-center gap-3 text-slate-500">
                  {a.publishedAt && fmt(a.publishedAt)}
                  {a.publishedUrl && <a href={a.publishedUrl} target="_blank" rel="noreferrer" style={{ color: agency.color }} className="print:hidden">Read ↗</a>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.topQueries.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="mb-3 text-lg font-semibold">Top Google searches</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1.5">Search</th><th className="text-right">Clicks</th><th className="text-right">Shown</th><th className="text-right">Position</th></tr></thead>
            <tbody>
              {data.topQueries.map((q) => (
                <tr key={q.query} className="border-t border-slate-100"><td className="py-1.5">{q.query}</td><td className="text-right">{q.clicks}</td><td className="text-right">{q.impressions.toLocaleString()}</td><td className="text-right">{q.position.toFixed(1)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3 break-inside-avoid">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Google reviews</div>
          <div className="mt-1 text-2xl font-semibold">{data.reviews.avg ?? "—"}{data.reviews.avg ? <span className="text-amber-500">★</span> : null}</div>
          <div className="text-xs text-slate-500">{data.reviews.total} reviews{data.reviews.replyRate !== null ? ` · ${data.reviews.replyRate}% replied` : ""}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Website health</div>
          <div className="mt-1 text-2xl font-semibold">{data.health?.score ?? "—"}<span className="text-base text-slate-400">/100</span></div>
          <div className="text-xs text-slate-500">{data.health ? (data.health.issues ? `${data.health.issues} critical issue${data.health.issues > 1 ? "s" : ""} being fixed` : "No critical issues") : "Not checked yet"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Google Maps ranking</div>
          <div className="mt-1 text-2xl font-semibold">{data.grid?.avgRank ?? "—"}</div>
          <div className="text-xs text-slate-500">{data.grid ? `Average rank for "${data.grid.keyword}" · top 3 in ${Math.round((data.grid.top3 ?? 0) * 100)}% of the area` : "Not tracked yet"}</div>
        </div>
      </section>

      {(data.planned.length > 0 || (data.summary?.next.length ?? 0) > 0) && (
        <section className="break-inside-avoid">
          <h2 className="mb-3 text-lg font-semibold">Coming next</h2>
          {data.summary?.next.length ? <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-700">{data.summary.next.map((n) => <li key={n}>{n}</li>)}</ul> : null}
          {data.planned.length > 0 && (
            <>
              <div className="mb-1 text-sm font-medium text-slate-600">Articles planned</div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">{data.planned.map((p) => <li key={p.title}>{p.title}</li>)}</ul>
            </>
          )}
        </section>
      )}

      <footer className="border-t pt-4 text-sm text-slate-500">
        {agency.footer ?? `Prepared by ${agency.name}.`}
      </footer>
    </div>
  );
}
