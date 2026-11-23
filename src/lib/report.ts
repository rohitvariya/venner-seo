// Monthly client report: everything done and achieved for one site in one calendar month.
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { snapshot, type ReportData } from "./grow/jobs";

export function monthRange(month?: string) {
  const now = new Date();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : null;
  const [y, mo] = m ? m.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const from = new Date(y, mo - 1, 1);
  const end = new Date(y, mo, 1);
  const to = end > now ? now : end;
  return { key: `${y}-${String(mo).padStart(2, "0")}`, from, to, partial: end > now, label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
}

/** The last 6 months, newest first, for the month picker. */
export function recentMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  });
}

export async function buildReport(siteId: string, month?: string) {
  const range = monthRange(month);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const nextMonthEnd = new Date(range.to.getTime() + 35 * 86400_000);
  const [site, snap, published, posts, replies, queries, planned, audit, grid, insight] = await Promise.all([
    db.query.sites.findFirst({ where: eq(schema.sites.id, siteId), with: { workspace: true } }),
    snapshot(siteId, { from: range.from, to: range.to }),
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, siteId), eq(schema.articles.status, "PUBLISHED"), gte(schema.articles.publishedAt, range.from), lt(schema.articles.publishedAt, range.to)),
      orderBy: asc(schema.articles.publishedAt),
      columns: { title: true, publishedUrl: true, publishedAt: true, heroImageUrl: true },
    }),
    db.query.socialPosts.findMany({
      where: and(eq(schema.socialPosts.siteId, siteId), eq(schema.socialPosts.status, "PUBLISHED"), gte(schema.socialPosts.publishedAt, range.from), lt(schema.socialPosts.publishedAt, range.to)),
      columns: { channel: true },
    }),
    db.query.reviews.findMany({
      where: and(eq(schema.reviews.siteId, siteId), gte(schema.reviews.repliedAt, range.from), lt(schema.reviews.repliedAt, range.to)),
      columns: { id: true },
    }),
    db.query.gscQueryMetrics.findMany({
      where: and(eq(schema.gscQueryMetrics.siteId, siteId), lt(schema.gscQueryMetrics.periodEnd, ymd(new Date(range.to.getTime() + 7 * 86400_000)))),
      orderBy: [desc(schema.gscQueryMetrics.periodEnd), desc(schema.gscQueryMetrics.clicks)],
      limit: 60,
    }),
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, siteId), inArray(schema.articles.status, ["IDEA", "WRITING", "REVIEW", "APPROVED", "SCHEDULED"]), gte(schema.articles.plannedFor, range.to), lt(schema.articles.plannedFor, nextMonthEnd)),
      orderBy: asc(schema.articles.plannedFor),
      columns: { title: true },
      limit: 8,
    }),
    db.query.siteAudits.findFirst({
      where: and(eq(schema.siteAudits.siteId, siteId), eq(schema.siteAudits.status, "DONE"), lt(schema.siteAudits.createdAt, range.to)),
      orderBy: desc(schema.siteAudits.createdAt),
    }),
    db.query.geoGridScans.findFirst({
      where: and(eq(schema.geoGridScans.siteId, siteId), eq(schema.geoGridScans.status, "DONE"), lt(schema.geoGridScans.createdAt, range.to)),
      orderBy: desc(schema.geoGridScans.createdAt),
    }),
    db.query.siteInsights.findFirst({
      where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, "report"), eq(schema.siteInsights.status, "DONE"),
        gte(schema.siteInsights.createdAt, range.from), lt(schema.siteInsights.createdAt, new Date(range.to.getTime() + 10 * 86400_000))),
      orderBy: desc(schema.siteInsights.createdAt),
    }),
  ]);
  if (!site) return null;
  // Top searches: the latest weekly/28-day snapshot of queries before the period ended.
  const latestEnd = queries[0]?.periodEnd;
  const topQueries = queries.filter((q) => q.periodEnd === latestEnd).slice(0, 10);
  const ws = site.workspace;
  return {
    range,
    site: { name: site.businessName ?? site.domain, domain: site.domain },
    agency: { name: ws.brandName ?? ws.name, logoUrl: ws.logoUrl, color: ws.brandColor ?? "#4f46e5", footer: ws.reportFooter },
    metrics: snap.metrics,
    reviews: snap.reviews,
    work: {
      articles: published,
      googlePosts: posts.filter((p) => p.channel === "google").length,
      socialPosts: posts.filter((p) => p.channel !== "google").length,
      replies: replies.length,
    },
    topQueries,
    planned,
    health: audit ? { score: audit.score, issues: audit.issues.filter((i) => i.severity === "critical").length } : null,
    grid: grid ? { keyword: grid.keyword, avgRank: grid.avgRank, top3: grid.top3Share } : null,
    summary: (insight?.data as ReportData | null) ?? null,
  };
}

export type ClientReportData = NonNullable<Awaited<ReturnType<typeof buildReport>>>;
