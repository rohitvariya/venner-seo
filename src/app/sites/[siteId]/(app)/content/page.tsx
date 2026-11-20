import Link from "next/link";
import { requireSite } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ArticleStatus } from "@/lib/schema";
import { planMore } from "@/app/actions";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { AutoRefresh, SubmitButton } from "@/components/ui";

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

export default async function ContentPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { siteId } = await params;
  const { filter } = await searchParams;
  await requireSite(siteId);
  const statusFilter: Record<string, ArticleStatus> = { review: "REVIEW", scheduled: "SCHEDULED", published: "PUBLISHED" };
  const A = schema.articles;
  const articles = await db.query.articles.findMany({
    where: and(eq(A.siteId, siteId), filter && statusFilter[filter] ? eq(A.status, statusFilter[filter]) : undefined),
    with: { keyword: true },
    orderBy: [asc(A.plannedFor), asc(A.createdAt)],
  });
  const busy = articles.some((a) => a.status === "IDEA" || a.status === "WRITING" || a.status === "PUBLISHING");

  const groups = new Map<string, typeof articles>();
  for (const a of articles) {
    const d = a.publishedAt ?? a.scheduledAt ?? a.plannedFor ?? a.createdAt;
    const key = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const tabs = [
    ["All", undefined],
    ["Needs review", "review"],
    ["Scheduled", "scheduled"],
    ["Published", "published"],
  ] as const;

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} intervalMs={5000} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Content calendar</h1>
        <form action={planMore.bind(null, siteId)}>
          <SubmitButton className="btn-secondary" pending="Planning…">+ Plan next month</SubmitButton>
        </form>
      </div>
      <div className="flex gap-2">
        {tabs.map(([label, value]) => (
          <Link
            key={label}
            href={value ? `?filter=${value}` : "?"}
            className={`rounded-full px-3 py-1 text-sm ${filter === value ? "bg-brand-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {articles.length === 0 && <p className="card text-sm text-slate-500">No articles here yet.</p>}
      {[...groups.entries()].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">{month}</h2>
          <div className="card divide-y divide-slate-100 p-0">
            {list.map((a) => (
              <Link key={a.id} href={`/sites/${siteId}/content/${a.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                <div className="w-14 text-sm text-slate-500">{fmt(a.publishedAt ?? a.scheduledAt ?? a.plannedFor)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.title}</div>
                  {a.keyword && <div className="truncate text-xs text-slate-500">Keyword: {a.keyword.phrase}</div>}
                </div>
                <ScoreBadge score={a.seoScore} />
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
