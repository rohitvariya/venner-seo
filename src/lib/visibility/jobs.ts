import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { structured } from "../ai";
import { loadContext } from "../jobs";
import { fetchText, listPostUrls } from "../crawl";
import { analyzeAnswer, askEngine, enabledEngines } from "./engines";
import { quoteScoreForHtml } from "./quote-score";
import { enqueue } from "../queue";

const { sites, aiQuestions, aiChecks, competitors, postScores } = schema;

/** Generates the questions buyers ask AI assistants about this business's services. */
export async function findQuestions(siteId: string) {
  const { site, context } = await loadContext(siteId);
  const out = await structured<{ questions: { question: string; topic: string }[] }>({
    system:
      "You research how buyers use AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews) to find and choose " +
      "service providers. Write questions exactly as a real buyer would type them: natural, specific, often asking for " +
      "recommendations, comparisons, costs or how to choose. Never mention the business by name.",
    prompt:
      `${context}\n\nList the 15 questions buyers most often ask AI assistants when looking for these services. ` +
      "Mix: 'best/top X in <city>' recommendation questions, 'how to choose a X', cost questions, comparisons, and " +
      "problem-led questions. Use the business's city or service areas in about half of them. Group each under the " +
      "related service as its topic.",
    schemaName: "ai_questions",
    schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: { question: { type: "string" }, topic: { type: "string" } },
            required: ["question", "topic"],
          },
        },
      },
      required: ["questions"],
    },
    maxTokens: 3000,
  });
  const rows = out.questions
    .map((q) => ({ siteId: site.id, question: q.question.trim(), topic: q.topic.trim() }))
    .filter((q) => q.question.length > 8)
    .slice(0, 20);
  if (rows.length) await db.insert(aiQuestions).values(rows).onConflictDoNothing();
  await enqueue("check-visibility", { siteId });
}

/** Asks every active question in every enabled engine and records whether the business shows up. */
export async function checkVisibility(siteId: string) {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return;
  await db.update(sites).set({ aiStatus: "RUNNING" }).where(eq(sites.id, siteId));
  try {
    const [questions, comps] = await Promise.all([
      db.query.aiQuestions.findMany({ where: and(eq(aiQuestions.siteId, siteId), eq(aiQuestions.hidden, false)) }),
      db.query.competitors.findMany({ where: eq(competitors.siteId, siteId) }),
    ]);
    const location = [site.city, site.country].filter(Boolean).join(", ") || null;
    const brand = { name: site.businessName, domain: site.domain };
    for (const q of questions) {
      for (const engine of enabledEngines()) {
        try {
          const answer = await askEngine(engine, q.question, location);
          const result = analyzeAnswer(answer, brand, comps);
          await db.insert(aiChecks).values({
            siteId,
            questionId: q.id,
            engine,
            ...result,
            citations: answer.citations.slice(0, 20),
            answerExcerpt: answer.text.slice(0, 4000),
          });
        } catch (err) {
          await db.insert(aiChecks).values({
            siteId,
            questionId: q.id,
            engine,
            mentioned: false,
            cited: false,
            error: err instanceof Error ? err.message.slice(0, 300) : String(err),
          });
        }
      }
    }
    await db.update(sites).set({ aiStatus: "DONE", aiCheckedAt: new Date() }).where(eq(sites.id, siteId));
  } catch (err) {
    await db.update(sites).set({ aiStatus: "FAILED" }).where(eq(sites.id, siteId));
    throw err;
  }
}

/** Fetches the site's existing blog posts and scores how likely AI is to quote each one. */
export async function scorePosts(siteId: string) {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return;
  const urls = await listPostUrls(site.domain, 30);
  for (const url of urls) {
    const html = await fetchText(url);
    if (!html) continue;
    const { title, score, checks } = quoteScoreForHtml(html, url);
    await db
      .insert(postScores)
      .values({ siteId, url, title, score, checks })
      .onConflictDoUpdate({ target: [postScores.siteId, postScores.url], set: { title, score, checks, checkedAt: new Date() } });
  }
}

/** Weekly re-check for sites that have questions. Called from the periodic tick. */
export async function queueWeeklyVisibility() {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const due = await db
    .update(sites)
    .set({ aiStatus: "QUEUED" })
    .where(
      and(
        or(isNull(sites.aiCheckedAt), lt(sites.aiCheckedAt, cutoff)),
        sql`${sites.aiStatus} not in ('QUEUED','RUNNING')`,
        sql`exists (select 1 from ai_questions q where q.site_id = ${sites.id} and q.hidden = false)`,
      ),
    )
    .returning({ id: sites.id });
  for (const s of due) await enqueue("check-visibility", { siteId: s.id });
}
