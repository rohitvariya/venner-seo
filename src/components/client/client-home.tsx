import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { db, schema } from "@/lib/db";
import { snapshot } from "@/lib/grow/jobs";
import type { Site } from "@/lib/schema";

/** Home for a client login: what needs their OK, what went live, and the headline numbers. */
export async function ClientHome({ site, firstName, agency }: { site: Site; firstName: string; agency: string }) {
  const base = `/sites/${site.id}`;
  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const [waiting, live, snap] = await Promise.all([
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, site.id), eq(schema.articles.status, "REVIEW")),
      orderBy: desc(schema.articles.updatedAt),
      columns: { id: true, title: true, clientNote: true, seoScore: true },
    }),
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, site.id), eq(schema.articles.status, "PUBLISHED"), gte(schema.articles.publishedAt, monthAgo)),
      orderBy: desc(schema.articles.publishedAt),
      columns: { id: true, title: true, publishedUrl: true, publishedAt: true },
    }),
    snapshot(site.id),
  ]);
  const metrics = snap.metrics.filter((m) => m.now !== null && !(m.now === 0 && (m.before ?? 0) === 0)).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {firstName}!</h2>
        <p className="text-sm text-slate-500">Here&apos;s what {agency} is doing for {site.businessName ?? site.domain}.</p>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Waiting for your OK ({waiting.length})</h3>
          {waiting.length > 0 && <span className="text-xs text-slate-500">Read each article, then approve it or ask for changes.</span>}
        </div>
        {waiting.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><CheckCircle2 size={16} className="text-green-600" />Nothing to approve right now.</p>
        ) : (
          <ul className="divide-y">
            {waiting.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <FileText size={16} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  {a.clientNote && <div className="truncate text-xs text-amber-700">You asked: {a.clientNote}</div>}
                </div>
                <Link href={`${base}/content/${a.id}`} className="btn-primary px-3 py-1.5 text-xs">Read &amp; approve</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {metrics.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Last 30 days</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => {
              const diff = m.before !== null && m.now !== null ? Math.round((m.now - m.before) * 10) / 10 : null;
              const good = diff !== null && (m.better === "down" ? diff < 0 : diff > 0);
              return (
                <div key={m.label} className="card">
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="mt-1 text-2xl font-semibold">{m.now?.toLocaleString()}{m.unit}</div>
                  {diff !== null && diff !== 0 && <div className={`text-xs ${good ? "text-green-700" : "text-red-700"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}{m.unit} vs previous 30 days</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Published this month ({live.length})</h3>
          <Link href={`${base}/results/report`} className="text-sm text-brand-600">Monthly report →</Link>
        </div>
        {live.length === 0 ? (
          <p className="text-sm text-slate-500">New articles will appear here once they go live.</p>
        ) : (
          <ul className="space-y-1.5">
            {live.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{a.title}</span>
                {a.publishedUrl && <a href={a.publishedUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-brand-600">View <ExternalLink size={12} /></a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
