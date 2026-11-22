import { and, desc, eq, inArray, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { crawlSite } from "./crawl";
import { analyzeBusiness, profileContext } from "./seo/profile";
import { enrichKeywords, keywordIdeas, pickForCalendar } from "./seo/keywords";
import { createBrief, factCheck, writeArticle } from "./seo/writer";
import { scoreArticle } from "./seo/score";
import { dataForSeoEnabled, organicResults } from "./dataforseo";
import { decryptJson } from "./crypto";
import { articleHtml } from "./publish/html";
import { publishToWordPress, type WordPressSecret } from "./publish/wordpress";
import { publishToShopify, type ShopifySecret } from "./publish/shopify";
import { fetchDaily, fetchTopQueries, type GscSecret } from "./gsc";
import { enqueue } from "./queue";
import { findStockPhoto } from "./images";
import type { Brief } from "./seo/writer";

const { sites, sitePages, services, serviceAreas, competitors, keywords, articles, integrations, gscDailyMetrics, gscQueryMetrics } = schema;

// Domains that show up in local SERPs but are directories, not competitors.
const NOT_COMPETITORS = /(justdial|indiamart|sulekha|clutch|goodfirms|linkedin|facebook|instagram|youtube|wikipedia|yelp|quora|reddit|glassdoor|naukri|upwork|fiverr|google|amazon|tripadvisor|yellowpages|medium)\./i;

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function loadContext(siteId: string, excludeArticleId?: string) {
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
    with: { services: true, areas: true, pages: { columns: { url: true, title: true, isService: true } } },
  });
  if (!site) throw new Error(`Site ${siteId} not found`);
  // Published articles become internal-link targets, building topic clusters over time.
  const published = await db.query.articles.findMany({
    where: and(eq(articles.siteId, siteId), eq(articles.status, "PUBLISHED"), isNotNull(articles.publishedUrl)),
    columns: { id: true, title: true, publishedUrl: true },
    orderBy: desc(articles.publishedAt),
    limit: 60,
  });
  const own = published
    .filter((a) => a.id !== excludeArticleId)
    .map((a) => ({ title: a.title, url: a.publishedUrl! }));
  return { site, context: profileContext(site, site.services, site.areas, site.pages, own) };
}

export async function scanSite(siteId: string) {
  const [site] = await db.update(sites).set({ scanStatus: "RUNNING", scanError: null }).where(eq(sites.id, siteId)).returning();
  if (!site) return;
  try {
    const pages = await crawlSite(site.domain);
    const a = await analyzeBusiness(site.domain, pages);
    const serviceUrls = new Set(a.servicePageUrls);
    const city = site.city ?? a.city;

    await db.transaction(async (tx) => {
      await tx.delete(sitePages).where(eq(sitePages.siteId, siteId));
      await tx
        .insert(sitePages)
        .values(pages.map((p) => ({ siteId, url: p.url, title: p.title, h1: p.h1, text: p.text, isService: serviceUrls.has(p.url) })))
        .onConflictDoNothing();
      await tx.delete(services).where(eq(services.siteId, siteId));
      if (a.services.length) {
        await tx.insert(services).values(a.services.map((s) => ({ siteId, name: s.name, pageUrl: s.pageUrl })));
      }
      await tx
        .update(sites)
        .set({
          businessName: site.businessName ?? a.businessName,
          category: a.category,
          summary: a.summary,
          language: a.language || "en",
          country: site.country ?? a.country,
          state: site.state ?? a.state,
          city,
          streetAddress: site.streetAddress ?? a.streetAddress,
          phone: site.phone ?? a.phone,
          toneOfVoice: site.toneOfVoice ?? a.toneOfVoice,
          // Fill blueprint gaps from the scan, never overwrite what the owner already entered.
          blueprint: {
            ...site.blueprint,
            idealCustomer: site.blueprint.idealCustomer || a.idealCustomer,
            differentiators: site.blueprint.differentiators.length ? site.blueprint.differentiators : a.differentiators,
            facts: site.blueprint.facts.length ? site.blueprint.facts : a.facts,
            targetSearches: site.blueprint.targetSearches.length
              ? site.blueprint.targetSearches
              : [...new Set(a.targetSearches.map((t) => t.toLowerCase().trim()))].slice(0, 30),
          },
        })
        .where(eq(sites.id, siteId));
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(serviceAreas).where(eq(serviceAreas.siteId, siteId));
      if (n === 0 && city) await tx.insert(serviceAreas).values({ siteId, name: city });
    });

    await discoverCompetitors(siteId, site.domain, a.services[0]?.name, city, site.country ?? a.country);
    await db.update(sites).set({ scanStatus: "DONE" }).where(eq(sites.id, siteId));
  } catch (err) {
    await db.update(sites).set({ scanStatus: "FAILED", scanError: errMsg(err) }).where(eq(sites.id, siteId));
    throw err;
  }
}

async function discoverCompetitors(siteId: string, ownDomain: string, service: string | undefined, city: string | null, country: string | null) {
  if (!dataForSeoEnabled() || !service) return;
  const existing = await db.query.competitors.findFirst({ where: eq(competitors.siteId, siteId) });
  if (existing) return;
  try {
    const items = await organicResults(`${service} ${city ?? ""}`.trim(), country ?? "United States");
    const seen = new Set<string>();
    const picks = items
      .filter((i) => {
        const d = i.domain!.replace(/^www\./, "");
        if (d === ownDomain || NOT_COMPETITORS.test(d + ".") || seen.has(d)) return false;
        seen.add(d);
        return true;
      })
      .slice(0, 6);
    if (picks.length) {
      await db.insert(competitors).values(
        picks.map((i) => ({ siteId, name: (i.title ?? i.domain!).split(/[|\-–]/)[0].trim().slice(0, 80), domain: i.domain! })),
      );
    }
  } catch (err) {
    console.error("Competitor discovery failed:", err);
  }
}

/** Builds the keyword list and fills the content calendar with IDEA articles, then queues writing. */
export async function planKeywords(siteId: string) {
  const { site, context } = await loadContext(siteId);
  const ideas = await keywordIdeas(context, 40, site.blueprint.targetSearches);
  const scored = await enrichKeywords(ideas, site.country);
  if (scored.length) {
    await db
      .insert(keywords)
      .values(scored.map((k) => ({ siteId, phrase: k.phrase, intent: k.intent, cluster: k.cluster, searchVolume: k.searchVolume, difficulty: k.difficulty, cpc: k.cpc })))
      .onConflictDoUpdate({
        target: [keywords.siteId, keywords.phrase],
        set: { searchVolume: sql`excluded.search_volume`, difficulty: sql`excluded.difficulty`, cpc: sql`excluded.cpc` },
      });
  }
  const available = await db.query.keywords.findMany({ where: and(eq(keywords.siteId, siteId), eq(keywords.status, "SUGGESTED")) });
  const picks = pickForCalendar(available, site.articlesPerMonth);

  const lastPlanned = await db.query.articles.findFirst({
    where: and(eq(articles.siteId, siteId), isNotNull(articles.plannedFor)),
    orderBy: desc(articles.plannedFor),
  });
  const start = Math.max(Date.now(), lastPlanned?.plannedFor?.getTime() ?? 0);
  const gapDays = 30 / Math.max(1, site.articlesPerMonth);

  for (const [i, k] of picks.entries()) {
    const plannedFor = new Date(start + (i + 1) * gapDays * 86400_000);
    const [article] = await db
      .insert(articles)
      .values({ siteId, keywordId: k.id, title: titleCase(k.phrase), plannedFor, status: "IDEA" })
      .returning({ id: articles.id });
    await db.update(keywords).set({ status: "PLANNED" }).where(eq(keywords.id, k.id));
    await enqueue("write-article", { articleId: article.id });
  }
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function writeArticleJob(articleId: string) {
  await db.update(articles).set({ status: "WRITING", error: null }).where(eq(articles.id, articleId));
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId), with: { keyword: true } });
  if (!article) return;
  try {
    const { site, context } = await loadContext(article.siteId, article.id);
    const keyword = article.keyword?.phrase ?? article.title;
    const others = await db.query.articles.findMany({
      where: and(eq(articles.siteId, site.id), ne(articles.id, article.id), notInArray(articles.status, ["IDEA", "WRITING"])),
      columns: { title: true },
    });
    const brief = await createBrief(context, keyword, others.map((o) => o.title));
    const contentMd = await writeArticle(context, keyword, brief, site.language);
    let factIssues: Awaited<ReturnType<typeof factCheck>> = [];
    try {
      factIssues = await factCheck(context, contentMd);
    } catch (err) {
      console.error("Fact check failed, continuing:", err);
    }
    const { score, checks } = scoreArticle({
      keyword,
      title: brief.title,
      metaTitle: brief.metaTitle,
      metaDescription: brief.metaDescription,
      slug: brief.slug,
      contentMd,
      siteDomain: site.domain,
    });
    await db
      .update(articles)
      .set({
        title: brief.title,
        slug: brief.slug,
        metaTitle: brief.metaTitle,
        metaDescription: brief.metaDescription,
        brief,
        faq: brief.faq,
        contentMd,
        seoScore: score,
        seoChecks: checks,
        factIssues,
        status: "REVIEW",
      })
      .where(eq(articles.id, articleId));
    if (article.keywordId) await db.update(keywords).set({ status: "USED" }).where(eq(keywords.id, article.keywordId));
  } catch (err) {
    await db.update(articles).set({ status: "FAILED", error: errMsg(err) }).where(eq(articles.id, articleId));
    throw err;
  }
}

/** Publishes (or, with draft: true, sends as an unpublished draft) to WordPress/Shopify. */
export async function publishArticleJob(articleId: string, opts: { draft?: boolean } = {}) {
  const draft = !!opts.draft;
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId), with: { site: true } });
  if (!article) return;
  const integration = await db.query.integrations.findFirst({
    where: and(eq(integrations.siteId, article.siteId), inArray(integrations.type, ["WORDPRESS", "SHOPIFY"])),
  });
  if (!article.contentMd || !integration) {
    await db
      .update(articles)
      .set({ status: "FAILED", error: !integration ? "Connect WordPress or Shopify first." : "Article has no content yet." })
      .where(eq(articles.id, articleId));
    return;
  }
  await db.update(articles).set({ status: "PUBLISHING", error: null }).where(eq(articles.id, articleId));
  try {
    const brief = article.brief as Brief | null;
    const keyword = (await db.query.keywords.findFirst({ where: eq(keywords.id, article.keywordId ?? "") }))?.phrase ?? null;

    // Featured image: the one set in the editor, else a stock photo for the keyword (if Unsplash is configured).
    let featuredImage: { url: string; alt: string; caption?: string } | null = article.heroImageUrl
      ? { url: article.heroImageUrl, alt: article.title }
      : null;
    if (!featuredImage) {
      try {
        const photo = await findStockPhoto(keyword ?? article.title);
        if (photo) {
          featuredImage = photo;
          await db.update(articles).set({ heroImageUrl: photo.url }).where(eq(articles.id, articleId));
        }
      } catch (err) {
        console.error("Stock photo lookup failed:", err);
      }
    }

    const html = articleHtml(article.contentMd, article.faq, {
      title: article.title,
      description: article.metaDescription,
      url: article.publishedUrl,
      // The featured image is shown by the theme (WordPress) / blog template (Shopify), so not repeated inline.
      heroImageUrl: null,
      author: article.site.blueprint.author,
      publisher: article.site.businessName ?? article.site.domain,
      datePublished: article.publishedAt ?? new Date(),
    });
    const result =
      integration.type === "WORDPRESS"
        ? await publishToWordPress(decryptJson<WordPressSecret>(integration.secret), {
            title: article.title,
            slug: article.slug,
            html,
            excerpt: article.metaDescription,
            status: draft ? "draft" : "publish",
            externalId: article.externalId,
            category: brief?.category,
            tags: brief?.tags,
            featuredImage,
            seo: {
              title: article.metaTitle || article.title,
              description: article.metaDescription ?? "",
              focusKeyword: keyword ?? "",
            },
          })
        : await publishToShopify(decryptJson<ShopifySecret>(integration.secret), {
            title: article.title,
            slug: article.slug,
            html,
            excerpt: article.metaDescription,
            author: article.site.blueprint.author?.name || article.site.businessName || article.site.domain,
            published: !draft,
            externalId: article.externalId,
            tags: brief?.tags,
            imageUrl: featuredImage?.url ?? null,
            imageAlt: featuredImage?.alt ?? null,
          });
    const notes: string[] = "notes" in result && Array.isArray(result.notes) ? (result.notes as string[]) : [];
    await db
      .update(articles)
      .set(
        draft
          ? { status: "APPROVED", publishedUrl: result.url, externalId: result.externalId, error: notes.length ? `Note: ${notes.join(" ")}` : null }
          : {
              status: "PUBLISHED",
              publishedAt: article.publishedAt ?? new Date(),
              publishedUrl: result.url,
              externalId: result.externalId,
              error: notes.length ? `Note: ${notes.join(" ")}` : null,
            },
      )
      .where(eq(articles.id, articleId));
  } catch (err) {
    await db.update(articles).set({ status: "FAILED", error: errMsg(err) }).where(eq(articles.id, articleId));
    throw err;
  }
}

export async function syncGsc(siteId: string) {
  const integration = await db.query.integrations.findFirst({
    where: and(eq(integrations.siteId, siteId), eq(integrations.type, "GSC")),
  });
  const property = integration?.config?.property;
  if (!integration || !property) return;
  const secret = decryptJson<GscSecret>(integration.secret);

  const daily = await fetchDaily(secret, property, 90);
  if (daily.length) {
    await db
      .insert(gscDailyMetrics)
      .values(daily.map((d) => ({ siteId, date: d.date, clicks: d.clicks, impressions: d.impressions, ctr: d.ctr, position: d.position })))
      .onConflictDoUpdate({
        target: [gscDailyMetrics.siteId, gscDailyMetrics.date],
        set: {
          clicks: sql`excluded.clicks`,
          impressions: sql`excluded.impressions`,
          ctr: sql`excluded.ctr`,
          position: sql`excluded.position`,
        },
      });
  }
  const top = await fetchTopQueries(secret, property, 28);
  await db.transaction(async (tx) => {
    await tx.delete(gscQueryMetrics).where(eq(gscQueryMetrics.siteId, siteId));
    if (top.rows.length) {
      await tx.insert(gscQueryMetrics).values(top.rows.map((r) => ({ siteId, periodEnd: top.periodEnd, ...r })));
    }
  });
  await db.update(integrations).set({ lastSyncedAt: new Date() }).where(eq(integrations.id, integration.id));
}

/** Runs every few minutes: publishes due scheduled articles and refreshes GSC about once a day. */
export async function tick() {
  const due = await db
    .update(articles)
    .set({ status: "PUBLISHING" })
    .where(and(eq(articles.status, "SCHEDULED"), lte(articles.scheduledAt, new Date())))
    .returning({ id: articles.id });
  for (const a of due) await enqueue("publish-article", { articleId: a.id });

  const cutoff = new Date(Date.now() - 20 * 3600_000);
  const stale = await db
    .update(integrations)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(integrations.type, "GSC"), sql`coalesce(${integrations.lastSyncedAt}, 'epoch') < ${cutoff}`))
    .returning({ siteId: integrations.siteId });
  for (const g of stale) await enqueue("sync-gsc", { siteId: g.siteId });
}
