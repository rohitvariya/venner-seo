// "Needs your attention": everything the owner should look at, most important first.

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { Site } from "./schema";

export type TodoType = "urgent" | "fix" | "ok" | "idea";
export type Todo = { id: string; title: string; detail: string; type: TodoType; action: { label: string; href: string } };

export const TODO_LABEL: Record<TodoType, string> = { urgent: "Urgent", fix: "Needs fixing", ok: "Needs your OK", idea: "Idea" };
const ORDER: TodoType[] = ["urgent", "fix", "ok", "idea"];

export function blueprintCompleteness(site: Site) {
  const bp = site.blueprint;
  const parts = [!!bp.idealCustomer, bp.differentiators.length >= 3, bp.facts.length >= 3, bp.targetSearches.length >= 10,
    !!site.toneOfVoice, !!bp.author?.name && !!bp.author.bio, bp.likedArticles.length > 0];
  return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}

export async function connectionsFor(siteId: string) {
  const rows = await db.query.integrations.findMany({ where: eq(schema.integrations.siteId, siteId), columns: { type: true, config: true } });
  const has = (t: string) => rows.some((r) => r.type === t);
  return {
    website: has("WORDPRESS") || has("SHOPIFY") || has("CUSTOM"),
    gbp: rows.some((r) => r.type === "GBP" && !!r.config?.location),
    gsc: has("GSC"),
  };
}

export async function computeTodos(site: Site): Promise<Todo[]> {
  const base = `/sites/${site.id}`;
  const A = schema.articles;
  const P = schema.socialPosts;
  const R = schema.reviews;
  const count = sql<number>`count(*)::int`;
  const weekAhead = new Date(Date.now() + 7 * 86400_000);
  const [[review], [failed], [factIssues], [postDrafts], [failedPosts], [unreplied], [lowUnreplied], [upcoming], conn] = await Promise.all([
    db.select({ n: count }).from(A).where(and(eq(A.siteId, site.id), eq(A.status, "REVIEW"))),
    db.select({ n: count }).from(A).where(and(eq(A.siteId, site.id), eq(A.status, "FAILED"))),
    db.select({ n: count }).from(A).where(and(eq(A.siteId, site.id), eq(A.status, "REVIEW"), sql`jsonb_array_length(coalesce(${A.factIssues}, '[]'::jsonb)) > 0`)),
    db.select({ n: count }).from(P).where(and(eq(P.siteId, site.id), eq(P.status, "DRAFT"), lte(P.scheduledAt, weekAhead))),
    db.select({ n: count }).from(P).where(and(eq(P.siteId, site.id), eq(P.status, "FAILED"), eq(P.channel, "google"))),
    db.select({ n: count }).from(R).where(and(eq(R.siteId, site.id), sql`${R.replyText} is null`)),
    db.select({ n: count }).from(R).where(and(eq(R.siteId, site.id), sql`${R.replyText} is null`, lte(R.rating, 3))),
    db.select({ n: count }).from(A).where(and(eq(A.siteId, site.id), inArray(A.status, ["IDEA", "WRITING", "REVIEW", "APPROVED", "SCHEDULED"]), gte(A.plannedFor, new Date()))),
    connectionsFor(site.id),
  ]);
  const todos: Todo[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (lowUnreplied.n > 0)
    todos.push({ id: "low-reviews", type: "urgent", title: `Reply to ${plural(lowUnreplied.n, "unhappy review", "unhappy reviews")}`, detail: "A quick, calm reply shows future customers you care. A draft is ready.", action: { label: "Reply", href: `${base}/reviews` } });
  if (failed.n > 0)
    todos.push({ id: "failed-articles", type: "fix", title: `${plural(failed.n, "article", "articles")} couldn't be written or published`, detail: "Open them to see what went wrong and try again.", action: { label: "Fix", href: `${base}/content?tab=articles&status=failed` } });
  if (failedPosts.n > 0)
    todos.push({ id: "failed-posts", type: "fix", title: `${plural(failedPosts.n, "Google post", "Google posts")} failed`, detail: "Check the error and post again.", action: { label: "Fix", href: `${base}/content?tab=google` } });
  if (factIssues.n > 0)
    todos.push({ id: "fact-issues", type: "fix", title: `${plural(factIssues.n, "draft has", "drafts have")} claims to check`, detail: "The fact check found statements your Business Blueprint doesn't back up.", action: { label: "Review", href: `${base}/content?tab=articles&status=review` } });
  if (!conn.website)
    todos.push({ id: "connect-website", type: "fix", title: "Connect your website", detail: "So approved articles can go live automatically (WordPress, Shopify or a custom site).", action: { label: "Connect", href: `${base}/integrations` } });
  if (!conn.gbp)
    todos.push({ id: "connect-gbp", type: "fix", title: "Connect Google Business Profile", detail: "So Google posts go out and you can reply to reviews here.", action: { label: "Connect", href: `${base}/integrations` } });
  if (!conn.gsc)
    todos.push({ id: "connect-gsc", type: "fix", title: "Connect Google Search Console", detail: "So we can see which searches bring people to you.", action: { label: "Connect", href: `${base}/integrations` } });
  if (upcoming.n < 3)
    todos.push({ id: "plan", type: "fix", title: "Your content plan is running low", detail: `${plural(upcoming.n, "article is", "articles are")} planned ahead. Plan the next month so content keeps going out.`, action: { label: "Plan", href: `${base}/content?tab=articles` } });
  if (review.n > 0)
    todos.push({ id: "review-articles", type: "ok", title: `${plural(review.n, "article is", "articles are")} waiting for your OK`, detail: "Read, edit if needed, and approve to publish.", action: { label: "Review", href: `${base}/content?tab=articles&status=review` } });
  if (postDrafts.n > 0)
    todos.push({ id: "review-posts", type: "ok", title: `${plural(postDrafts.n, "post", "posts")} for this week need your OK`, detail: "Approve Google and social posts before they're due.", action: { label: "Review", href: `${base}/content?tab=social` } });
  if (unreplied.n - lowUnreplied.n > 0)
    todos.push({ id: "reviews", type: "ok", title: `${plural(unreplied.n - lowUnreplied.n, "review", "reviews")} waiting for a reply`, detail: "Replies are drafted. Post them in one click.", action: { label: "Reply", href: `${base}/reviews` } });
  const bp = blueprintCompleteness(site);
  if (bp < 70)
    todos.push({ id: "blueprint", type: "ok", title: "Tell us what makes you different", detail: `Your Business Blueprint is ${bp}% complete. Proof points and facts make every article more about you.`, action: { label: "Answer", href: `${base}/business` } });
  if (site.aiCheckedAt == null)
    todos.push({ id: "ai", type: "idea", title: "See whether AI assistants recommend you", detail: "Check how ChatGPT-style assistants answer your customers' questions.", action: { label: "Check", href: `${base}/grow` } });

  return todos.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}
