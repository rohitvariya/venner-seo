// Grow: 30-day plan, monthly growth report, conversations to join, directories to list on,
// and upcoming events/holidays to post about. Each is stored as a site_insights row.
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { enqueue } from "../queue";
import { researchStructured, structured } from "../ai";
import { loadContext } from "../jobs";
import { computeTodos } from "../todos";
import { hostOf } from "../visibility/engines";
import type { InsightKind } from "../schema";

export type GrowKind = Extract<InsightKind, "plan" | "report" | "conversations" | "directories" | "events">;
export const GROW_KINDS: GrowKind[] = ["plan", "report", "conversations", "directories", "events"];

export type PlanTask = { id: string; title: string; why: string; area: "content" | "google" | "reviews" | "website" | "ai" | "social" };
export type PlanData = { summary: string; weeks: { week: number; focus: string; tasks: PlanTask[] }[]; done: string[] };
export type ReportMetric = { label: string; now: number | null; before: number | null; unit?: string; better?: "up" | "down" };
export type ReportData = { period: { from: string; to: string }; metrics: ReportMetric[]; summary: string; wins: string[]; next: string[] };
export type Conversation = { title: string; url: string; platform: string; summary: string; suggestedReply: string };
export type ConversationsData = { items: Conversation[] };
export type Directory = { name: string; url: string; why: string; priority: "high" | "medium" | "low"; listed: "yes" | "no" | "unknown"; profileUrl?: string | null };
export type DirectoriesData = { items: Directory[]; done: string[] };
export type EventIdea = { date: string; name: string; idea: string };
export type EventsData = { items: EventIdea[]; drafted: string[] };

export async function startInsight(siteId: string, kind: GrowKind) {
  const [row] = await db.insert(schema.siteInsights).values({ siteId, kind, status: "QUEUED" }).returning({ id: schema.siteInsights.id });
  await enqueue("make-insight", { siteId, insightId: row.id });
  return row.id;
}

export async function latestGrow<T>(siteId: string, kind: GrowKind) {
  const rows = await db.query.siteInsights.findMany({
    where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, kind)),
    orderBy: desc(schema.siteInsights.createdAt),
    limit: 2,
  });
  const latest = rows[0] ?? null;
  const lastDone = rows.find((r) => r.status === "DONE") ?? null;
  return {
    running: latest ? latest.status === "QUEUED" || latest.status === "RUNNING" : false,
    error: latest?.status === "FAILED" ? latest.error : null,
    row: lastDone,
    data: (lastDone?.data ?? null) as T | null,
  };
}

/** Most-cited websites in AI answers (directories, review sites, competitors). */
function topHosts(urls: string[]) {
  const n = new Map<string, number>();
  for (const u of urls) {
    const h = hostOf(u);
    if (h) n.set(h, (n.get(h) ?? 0) + 1);
  }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([h]) => h);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);

/** Numbers for the last 30 days and the 30 before, across every channel we track. */
export async function snapshot(siteId: string) {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const d60 = new Date(now.getTime() - 60 * 86400_000);
  const [gsc, gbp, reviews, published, posts, checks, audits, grid] = await Promise.all([
    db.query.gscDailyMetrics.findMany({ where: and(eq(schema.gscDailyMetrics.siteId, siteId), gte(schema.gscDailyMetrics.date, ymd(d60))) }),
    db.query.gbpDailyMetrics.findMany({ where: and(eq(schema.gbpDailyMetrics.siteId, siteId), gte(schema.gbpDailyMetrics.date, ymd(d60))) }),
    db.query.reviews.findMany({ where: eq(schema.reviews.siteId, siteId), columns: { rating: true, reviewedAt: true, replyText: true } }),
    db.query.articles.findMany({ where: and(eq(schema.articles.siteId, siteId), eq(schema.articles.status, "PUBLISHED")), columns: { publishedAt: true, title: true } }),
    db.query.socialPosts.findMany({ where: and(eq(schema.socialPosts.siteId, siteId), eq(schema.socialPosts.status, "PUBLISHED")), columns: { publishedAt: true } }),
    db.query.aiChecks.findMany({ where: and(eq(schema.aiChecks.siteId, siteId), gte(schema.aiChecks.checkedAt, d60)), columns: { mentioned: true, checkedAt: true, citations: true } }),
    db.query.siteAudits.findMany({ where: and(eq(schema.siteAudits.siteId, siteId), eq(schema.siteAudits.status, "DONE")), orderBy: desc(schema.siteAudits.createdAt), limit: 8 }),
    db.query.geoGridScans.findMany({ where: and(eq(schema.geoGridScans.siteId, siteId), eq(schema.geoGridScans.status, "DONE")), orderBy: desc(schema.geoGridScans.createdAt), limit: 8 }),
  ]);
  const inNow = (d: Date | string | null | undefined) => !!d && new Date(d) >= d30;
  const inPrev = (d: Date | string | null | undefined) => !!d && new Date(d) >= d60 && new Date(d) < d30;
  const gscNow = gsc.filter((r) => inNow(r.date));
  const gscPrev = gsc.filter((r) => inPrev(r.date));
  const gbpNow = gbp.filter((r) => inNow(r.date));
  const gbpPrev = gbp.filter((r) => inPrev(r.date));
  const share = (rows: typeof checks) => (rows.length ? Math.round((rows.filter((c) => c.mentioned).length / rows.length) * 100) : null);
  const auditNow = audits[0] ?? null;
  const auditPrev = audits.find((a) => a.createdAt < d30) ?? null;
  const gridNow = grid[0] ?? null;
  const gridPrev = grid.find((g) => g.createdAt < d30 && g.keyword === gridNow?.keyword) ?? null;
  const metrics: ReportMetric[] = [
    { label: "Google Search clicks", now: gsc.length ? sum(gscNow, (r) => r.clicks) : null, before: gsc.length ? sum(gscPrev, (r) => r.clicks) : null, better: "up" },
    { label: "Google Search impressions", now: gsc.length ? sum(gscNow, (r) => r.impressions) : null, before: gsc.length ? sum(gscPrev, (r) => r.impressions) : null, better: "up" },
    { label: "Profile views (Maps + Search)", now: gbp.length ? sum(gbpNow, (r) => r.searchViews + r.mapsViews) : null, before: gbp.length ? sum(gbpPrev, (r) => r.searchViews + r.mapsViews) : null, better: "up" },
    { label: "Calls from Google", now: gbp.length ? sum(gbpNow, (r) => r.calls) : null, before: gbp.length ? sum(gbpPrev, (r) => r.calls) : null, better: "up" },
    { label: "Direction requests", now: gbp.length ? sum(gbpNow, (r) => r.directions) : null, before: gbp.length ? sum(gbpPrev, (r) => r.directions) : null, better: "up" },
    { label: "Website clicks from profile", now: gbp.length ? sum(gbpNow, (r) => r.websiteClicks) : null, before: gbp.length ? sum(gbpPrev, (r) => r.websiteClicks) : null, better: "up" },
    { label: "New Google reviews", now: reviews.filter((r) => inNow(r.reviewedAt)).length, before: reviews.filter((r) => inPrev(r.reviewedAt)).length, better: "up" },
    { label: "Articles published", now: published.filter((a) => inNow(a.publishedAt)).length, before: published.filter((a) => inPrev(a.publishedAt)).length, better: "up" },
    { label: "Posts published", now: posts.filter((p) => inNow(p.publishedAt)).length, before: posts.filter((p) => inPrev(p.publishedAt)).length, better: "up" },
    { label: "Mentioned in AI answers", now: share(checks.filter((c) => inNow(c.checkedAt))), before: share(checks.filter((c) => inPrev(c.checkedAt))), unit: "%", better: "up" },
    { label: "Website health", now: auditNow?.score ?? null, before: auditPrev?.score ?? null, unit: "/100", better: "up" },
    { label: gridNow ? `Map rank for "${gridNow.keyword}"` : "Average map rank", now: gridNow?.avgRank ?? null, before: gridPrev?.avgRank ?? null, better: "down" },
  ];
  return {
    period: { from: ymd(d30), to: ymd(now) },
    metrics,
    reviews: {
      total: reviews.length,
      avg: reviews.length ? Math.round((sum(reviews, (r) => r.rating) / reviews.length) * 10) / 10 : null,
      replyRate: reviews.length ? Math.round((reviews.filter((r) => r.replyText).length / reviews.length) * 100) : null,
    },
    topIssues: (auditNow?.issues ?? []).slice(0, 6).map((i) => `${i.severity}: ${i.title}`),
    aiSources: topHosts(checks.flatMap((c) => c.citations)),
    recentArticles: published.filter((a) => inNow(a.publishedAt)).map((a) => a.title).slice(0, 10),
  };
}

function snapshotText(s: Awaited<ReturnType<typeof snapshot>>) {
  const lines = s.metrics
    .filter((m) => m.now !== null)
    .map((m) => `- ${m.label}: ${m.now}${m.unit ?? ""} (previous 30 days: ${m.before ?? "n/a"}${m.before !== null ? (m.unit ?? "") : ""})`);
  return [
    `Period: ${s.period.from} to ${s.period.to}`,
    ...lines,
    s.reviews.total ? `- Reviews: ${s.reviews.total} total, average ${s.reviews.avg}★, ${s.reviews.replyRate}% replied` : "- No Google reviews synced (profile may not be connected)",
    s.topIssues.length ? `Website problems:\n${s.topIssues.map((i) => `  - ${i}`).join("\n")}` : "",
    s.recentArticles.length ? `Articles published this period: ${s.recentArticles.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

const AREAS = ["content", "google", "reviews", "website", "ai", "social"];

async function makePlan(siteId: string): Promise<PlanData> {
  const { context, site } = await loadContext(siteId);
  const snap = await snapshot(siteId);
  const todos = await computeTodos(site);
  const out = await structured<{ summary: string; weeks: { week: number; focus: string; tasks: Omit<PlanTask, "id">[] }[] }>({
    system:
      "You are a practical local-SEO and growth consultant for small businesses. Make a 30-day plan the owner can follow: 4 weeks, 3-5 concrete tasks per week, ordered by impact. Each task is one action someone can finish in under 2 hours (e.g. \"Ask 5 recent clients for a Google review using your review link\", \"Fix the 7 pages without meta descriptions\"). Base tasks on the numbers and problems given; don't invent facts about the business. Plain, friendly English.",
    prompt: `${context}\n\nCurrent numbers:\n${snapshotText(snap)}\n\nOpen to-dos in the app:\n${todos.map((t) => `- ${t.title}: ${t.detail}`).join("\n") || "none"}\n\nMake the 30-day growth plan.`,
    schemaName: "growth_plan",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentences: where the business stands and the main goal for the month" },
        weeks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              week: { type: "integer" },
              focus: { type: "string", description: "Theme of the week in a few words" },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: { title: { type: "string" }, why: { type: "string", description: "One sentence on the expected result" }, area: { type: "string", enum: AREAS } },
                  required: ["title", "why", "area"],
                },
              },
            },
            required: ["week", "focus", "tasks"],
          },
        },
      },
      required: ["summary", "weeks"],
    },
  });
  return {
    summary: out.summary,
    weeks: out.weeks.slice(0, 4).map((w, wi) => ({
      week: wi + 1,
      focus: w.focus,
      tasks: w.tasks.slice(0, 6).map((t, ti) => ({ ...t, area: (AREAS.includes(t.area) ? t.area : "content") as PlanTask["area"], id: `w${wi + 1}-${ti}` })),
    })),
    done: [],
  };
}

async function makeReport(siteId: string): Promise<ReportData> {
  const { context } = await loadContext(siteId);
  const snap = await snapshot(siteId);
  const out = await structured<{ summary: string; wins: string[]; next: string[] }>({
    system:
      "You write a short monthly growth report for a small-business owner. Be honest: say what went up, what went down and why it likely happened, using only the numbers given. No jargon. Don't invent numbers.",
    prompt: `${context}\n\nNumbers:\n${snapshotText(snap)}\n\nWrite the report.`,
    schemaName: "growth_report",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "3-5 sentences overview of the month" },
        wins: { type: "array", items: { type: "string" }, description: "Up to 4 wins, each one sentence with the number" },
        next: { type: "array", items: { type: "string" }, description: "3-4 most important things to do next month" },
      },
      required: ["summary", "wins", "next"],
    },
  });
  return { period: snap.period, metrics: snap.metrics, summary: out.summary, wins: out.wins.slice(0, 4), next: out.next.slice(0, 4) };
}

async function makeConversations(siteId: string): Promise<ConversationsData> {
  const { context, site } = await loadContext(siteId);
  const out = await researchStructured<{ items: Conversation[] }>({
    system:
      "You find recent online conversations (Reddit, Quora, industry forums, LinkedIn posts) where people ask questions this business could genuinely help with: asking for recommendations, comparing options, describing a problem the business solves. Prefer threads from the last 12 months and from the business's country or city when relevant. For each, write a helpful reply the owner could post: answer the question first with real advice, mention the business only at the end and openly (\"I run X, happy to help\"), never spammy.",
    prompt: `${context}\n\nFind 6-10 conversations worth joining for ${site.businessName ?? site.domain}${site.city ? ` (based in ${site.city}${site.country ? `, ${site.country}` : ""})` : ""}.`,
    schemaName: "conversations",
    maxSearches: 6,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }, url: { type: "string" }, platform: { type: "string", description: "Reddit, Quora, forum name…" },
              summary: { type: "string", description: "What the person is asking, one sentence" },
              suggestedReply: { type: "string", description: "80-160 word helpful reply" },
            },
            required: ["title", "url", "platform", "summary", "suggestedReply"],
          },
        },
      },
      required: ["items"],
    },
  });
  return { items: (out.items ?? []).filter((i) => /^https?:\/\//.test(i.url)).slice(0, 12) };
}

async function makeDirectories(siteId: string): Promise<DirectoriesData> {
  const { context, site } = await loadContext(siteId);
  const snap = await snapshot(siteId);
  const out = await researchStructured<{ items: Directory[] }>({
    system:
      "You are a local-SEO citation specialist. List the business directories and listing sites that matter most for this business: general ones for its country (e.g. Google Business Profile, Bing Places, Apple Business Connect, Justdial, Sulekha, IndiaMART for India), industry ones (e.g. Clutch, GoodFirms for agencies) and any sites AI assistants cite for its searches. Search to check whether the business already has a listing on each; set listed to yes (with profileUrl), no, or unknown. Only real sites.",
    prompt: `${context}\n\nSites AI assistants cited when answering this business's customers' questions: ${snap.aiSources.join(", ") || "none yet"}.\n\nList 12-18 directories for ${site.businessName ?? site.domain}, most important first.`,
    schemaName: "directories",
    maxSearches: 8,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, url: { type: "string", description: "Homepage or the 'add your business' page" },
              why: { type: "string", description: "Why it matters for this business, one sentence" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              listed: { type: "string", enum: ["yes", "no", "unknown"] },
              profileUrl: { type: ["string", "null"] },
            },
            required: ["name", "url", "why", "priority", "listed"],
          },
        },
      },
      required: ["items"],
    },
  });
  return { items: (out.items ?? []).slice(0, 20), done: [] };
}

async function makeEvents(siteId: string): Promise<EventsData> {
  const { context, site } = await loadContext(siteId);
  const today = new Date();
  const end = new Date(today.getTime() + 75 * 86400_000);
  const out = await researchStructured<{ items: EventIdea[] }>({
    system:
      "You plan seasonal content for a local business. List holidays, festivals, awareness days and seasonal moments in the given date range that are relevant to the business's country, state/city and industry (e.g. Diwali, Uttarayan in Gujarat, Christmas, New Year, Republic Day, Black Friday for ecommerce, financial year-end). Check exact dates for this year by searching when a date moves each year. For each, give one post idea that ties the occasion to the business naturally, without hard selling.",
    prompt: `${context}\n\nDate range: ${ymd(today)} to ${ymd(end)}. Location: ${[site.city, site.state, site.country].filter(Boolean).join(", ") || "unknown"}. List 6-12 occasions in date order.`,
    schemaName: "events",
    maxSearches: 4,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { date: { type: "string", description: "YYYY-MM-DD" }, name: { type: "string" }, idea: { type: "string", description: "Post idea, one or two sentences" } },
            required: ["date", "name", "idea"],
          },
        },
      },
      required: ["items"],
    },
  });
  const items = (out.items ?? [])
    .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date) && i.date >= ymd(today) && i.date <= ymd(end))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { items, drafted: [] };
}

export async function makeInsight(insightId: string) {
  const row = await db.query.siteInsights.findFirst({ where: eq(schema.siteInsights.id, insightId) });
  if (!row) return;
  await db.update(schema.siteInsights).set({ status: "RUNNING", error: null }).where(eq(schema.siteInsights.id, insightId));
  try {
    const make = { plan: makePlan, report: makeReport, conversations: makeConversations, directories: makeDirectories, events: makeEvents }[row.kind as GrowKind];
    if (!make) throw new Error(`Unknown insight ${row.kind}`);
    const data = await make(row.siteId);
    await db.update(schema.siteInsights).set({ status: "DONE", data: data as unknown as Record<string, unknown> }).where(eq(schema.siteInsights.id, insightId));
  } catch (err) {
    await db
      .update(schema.siteInsights)
      .set({ status: "FAILED", error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.siteInsights.id, insightId));
    throw err;
  }
}

/** Ticks a plan task / directory as done (or undone) on the latest stored insight. */
export async function toggleDone(siteId: string, kind: "plan" | "directories", itemId: string) {
  const row = await db.query.siteInsights.findFirst({
    where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, kind), eq(schema.siteInsights.status, "DONE")),
    orderBy: desc(schema.siteInsights.createdAt),
  });
  if (!row?.data) return;
  const data = row.data as { done?: string[] };
  const done = new Set(data.done ?? []);
  if (done.has(itemId)) done.delete(itemId);
  else done.add(itemId);
  await db.update(schema.siteInsights).set({ data: { ...data, done: [...done] } }).where(eq(schema.siteInsights.id, row.id));
}

/** Monthly report on the 1st; a fresh events list every 2 weeks (both only for set-up sites). */
export async function queueGrowRoutines() {
  const sites = await db.query.sites.findMany({ where: eq(schema.sites.onboardingStep, "DONE"), columns: { id: true } });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const twoWeeks = new Date(now.getTime() - 14 * 86400_000);
  for (const s of sites) {
    const has = async (kind: GrowKind, since: Date) =>
      Boolean(await db.query.siteInsights.findFirst({
        where: and(eq(schema.siteInsights.siteId, s.id), eq(schema.siteInsights.kind, kind), gte(schema.siteInsights.createdAt, since)),
        columns: { id: true },
      }));
    if (!(await has("report", monthStart))) await startInsight(s.id, "report");
    if (!(await has("events", twoWeeks))) await startInsight(s.id, "events");
  }
}

