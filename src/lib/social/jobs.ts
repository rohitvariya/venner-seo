// Google Business Profile + social posts and review replies.

import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { structured, text } from "../ai";
import { loadContext } from "../jobs";
import { decryptJson } from "../crypto";
import { createLocalPost, listReviews, replyToReview, starsOf, type GbpSecret } from "../gbp";
import { enqueue } from "../queue";
import type { PostChannel } from "../schema";

const { sites, articles, socialPosts, reviews, integrations } = schema;

const CHANNEL_RULES: Record<PostChannel, string> = {
  google:
    "Google Business Profile update: 80-200 words, plain text, no hashtags, no emojis, local and practical, mention the city, end with a clear next step.",
  facebook: "Facebook post: 40-120 words, friendly, 1-2 emojis max, a question or hook first, 2-3 hashtags at the end.",
  instagram: "Instagram caption: hook in the first line, 60-150 words, short lines, 1-3 emojis, 8-12 relevant hashtags at the end (local + niche).",
  linkedin: "LinkedIn post: professional founder voice, 80-200 words, an insight or lesson first, short paragraphs, 3 hashtags max.",
  x: "X (Twitter) post: under 270 characters including the link, punchy, 1-2 hashtags.",
};

async function googleLocation(siteId: string) {
  const row = await db.query.integrations.findFirst({ where: and(eq(integrations.siteId, siteId), eq(integrations.type, "GBP")) });
  const cfg = row?.config ?? {};
  if (!row || !cfg.account || !cfg.location) return null;
  return { secret: decryptJson<GbpSecret>(row.secret), loc: { account: cfg.account, location: cfg.location } };
}

type GeneratedPost = { channel: PostChannel; text: string; articleTitle: string | null; cta: string | null };

/**
 * Plans the next 2 weeks of posts: Google posts at the site's weekly rate, plus one post per
 * other selected channel per week. Promotes published articles first, then services.
 */
export async function generatePosts(siteId: string) {
  const { site, context } = await loadContext(siteId);
  const recent = await db.query.articles.findMany({
    where: and(eq(articles.siteId, siteId), eq(articles.status, "PUBLISHED"), isNotNull(articles.publishedUrl)),
    orderBy: desc(articles.publishedAt),
    limit: 8,
  });
  const channels = site.socialChannels.length ? site.socialChannels : ["google"];
  const counts = channels.map((c) => `${c}: ${c === "google" ? site.googlePostsPerWeek * 2 : 2}`).join(", ");
  const out = await structured<{ posts: GeneratedPost[] }>({
    system:
      "You write short posts for a business's Google Business Profile and social media. Ground every post in the business's " +
      "real services and proof points; never invent offers, prices, discounts, awards, events or client names. Vary the angle " +
      "(tip, myth vs fact, mini case explanation, FAQ answer, service highlight, new article). Write in the business's tone.",
    prompt:
      `${context}\n\n` +
      (recent.length ? `Recently published articles (promote some of these, use the exact title in articleTitle):\n${recent.map((a) => `- ${a.title}`).join("\n")}\n\n` : "") +
      `Write posts for the next 2 weeks. Number per channel: ${counts}.\nChannel rules:\n` +
      channels.map((c) => `- ${CHANNEL_RULES[c as PostChannel]}`).join("\n") +
      "\nFor Google posts set cta to LEARN_MORE when promoting an article, otherwise CALL. Leave cta null for other channels.",
    schemaName: "social_posts",
    schema: {
      type: "object",
      properties: {
        posts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["google", "facebook", "instagram", "linkedin", "x"] },
              text: { type: "string" },
              articleTitle: { type: ["string", "null"] },
              cta: { type: ["string", "null"], enum: ["LEARN_MORE", "CALL", "BOOK", null] },
            },
            required: ["channel", "text", "articleTitle", "cta"],
          },
        },
      },
      required: ["posts"],
    },
    maxTokens: 8000,
  });

  // Spread across the next 14 days, per channel, at 10:30 local-ish time.
  const byChannel = new Map<PostChannel, GeneratedPost[]>();
  for (const p of out.posts) if (channels.includes(p.channel)) byChannel.set(p.channel, [...(byChannel.get(p.channel) ?? []), p]);
  const rows: (typeof socialPosts.$inferInsert)[] = [];
  for (const [channel, posts] of byChannel) {
    posts.forEach((p, i) => {
      const day = new Date();
      day.setDate(day.getDate() + 1 + Math.floor(((i + 0.5) * 14) / posts.length));
      day.setHours(10, 30, 0, 0);
      const article = p.articleTitle ? recent.find((a) => a.title === p.articleTitle) : undefined;
      rows.push({
        siteId,
        channel,
        text: p.text.trim(),
        articleId: article?.id ?? null,
        link: article?.publishedUrl ?? `https://${site.domain}`,
        imageUrl: article?.heroImageUrl ?? null,
        cta: channel === "google" ? (article ? "LEARN_MORE" : p.cta ?? "CALL") : null,
        status: "DRAFT",
        scheduledAt: day,
      });
    });
  }
  if (rows.length) await db.insert(socialPosts).values(rows);
}

/** When an article goes live, draft a Google post promoting it (scheduled for the next morning). */
export async function draftGooglePostForArticle(articleId: string) {
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId), with: { site: true } });
  if (!article?.publishedUrl || !(await googleLocation(article.siteId))) return;
  const exists = await db.query.socialPosts.findFirst({
    where: and(eq(socialPosts.articleId, articleId), eq(socialPosts.channel, "google")),
  });
  if (exists) return;
  const { context } = await loadContext(article.siteId);
  const body = await text({
    system: `You write Google Business Profile updates. ${CHANNEL_RULES.google} Never invent offers or numbers. Output only the post text.`,
    prompt: `${context}\n\nWrite a Google post that shares the single most useful takeaway from this new article and invites people to read it.\nTitle: ${article.title}\nSummary: ${article.metaDescription ?? ""}`,
    maxTokens: 600,
  });
  const when = new Date(Date.now() + 18 * 3600_000);
  await db.insert(socialPosts).values({
    siteId: article.siteId,
    articleId,
    channel: "google",
    text: body,
    link: article.publishedUrl,
    imageUrl: article.heroImageUrl,
    cta: "LEARN_MORE",
    status: "DRAFT",
    scheduledAt: when,
  });
}

/** Publishes one post. Google posts go to the Business Profile; other channels are marked as ready to post. */
export async function publishPost(postId: string) {
  const post = await db.query.socialPosts.findFirst({ where: eq(socialPosts.id, postId) });
  if (!post) return;
  if (post.channel !== "google") {
    await db.update(socialPosts).set({ status: "FAILED", error: "Automatic posting to this channel isn't connected yet. Copy the text and post it, then mark it as posted." }).where(eq(socialPosts.id, postId));
    return;
  }
  const g = await googleLocation(post.siteId);
  if (!g) {
    await db.update(socialPosts).set({ status: "FAILED", error: "Connect Google Business Profile first." }).where(eq(socialPosts.id, postId));
    return;
  }
  await db.update(socialPosts).set({ status: "PUBLISHING", error: null }).where(eq(socialPosts.id, postId));
  try {
    const res = await createLocalPost(g.secret, g.loc, { text: post.text, link: post.link, cta: post.cta, imageUrl: post.imageUrl });
    await db
      .update(socialPosts)
      .set({ status: "PUBLISHED", publishedAt: new Date(), externalId: res.externalId, externalUrl: res.url })
      .where(eq(socialPosts.id, postId));
  } catch (err) {
    await db.update(socialPosts).set({ status: "FAILED", error: err instanceof Error ? err.message : String(err) }).where(eq(socialPosts.id, postId));
    throw err;
  }
}

/** Drafts a reply to one review in the business's voice. */
async function draftReply(context: string, review: { reviewer: string | null; rating: number; comment: string | null }) {
  return text({
    system:
      "You reply to Google reviews for a business. Warm, specific, human, 30-80 words. Thank the reviewer by first name if given. " +
      "For 4-5 stars: thank them and reference what they praised. For 1-3 stars: apologise without arguing, acknowledge the issue, " +
      "invite them to continue offline using the business's real phone/email. Never offer refunds or discounts, never invent facts, " +
      "never mention AI. Output only the reply text.",
    prompt: `${context}\n\nReview (${review.rating}/5) by ${review.reviewer ?? "a customer"}:\n${review.comment || "(no text, rating only)"}`,
    maxTokens: 400,
  });
}

/** Pulls reviews from Google, drafts replies for unanswered ones, and auto-replies to 4-5 stars if enabled. */
export async function syncReviews(siteId: string) {
  const g = await googleLocation(siteId);
  if (!g) return;
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) return;
  const list = await listReviews(g.secret, g.loc);
  for (const r of list) {
    await db
      .insert(reviews)
      .values({
        siteId,
        externalName: r.name,
        reviewer: r.reviewer?.displayName ?? null,
        rating: starsOf(r),
        comment: r.comment ?? null,
        reviewedAt: r.createTime ? new Date(r.createTime) : null,
        replyText: r.reviewReply?.comment ?? null,
        repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
      })
      .onConflictDoUpdate({
        target: [reviews.siteId, reviews.externalName],
        set: {
          comment: r.comment ?? null,
          rating: starsOf(r),
          replyText: r.reviewReply?.comment ?? null,
          repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
        },
      });
  }
  const pending = await db.query.reviews.findMany({
    where: and(eq(reviews.siteId, siteId), sql`${reviews.replyText} is null`, sql`${reviews.draftReply} is null`),
    limit: 25,
  });
  if (pending.length === 0) return;
  const { context } = await loadContext(siteId);
  for (const r of pending) {
    try {
      const draft = await draftReply(context, r);
      await db.update(reviews).set({ draftReply: draft, error: null }).where(eq(reviews.id, r.id));
      if (site.autoReplyPositive && r.rating >= 4) {
        await replyToReview(g.secret, r.externalName, draft);
        await db.update(reviews).set({ replyText: draft, repliedAt: new Date(), draftReply: null }).where(eq(reviews.id, r.id));
      }
    } catch (err) {
      await db.update(reviews).set({ error: err instanceof Error ? err.message : String(err) }).where(eq(reviews.id, r.id));
    }
  }
}

export async function sendReviewReply(reviewId: string, reply: string) {
  const r = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!r) return;
  const g = await googleLocation(r.siteId);
  if (!g) throw new Error("Connect Google Business Profile first.");
  await replyToReview(g.secret, r.externalName, reply);
  await db.update(reviews).set({ replyText: reply, repliedAt: new Date(), draftReply: null, error: null }).where(eq(reviews.id, reviewId));
}

/** From the periodic tick: publish due scheduled Google posts and sync reviews every ~6 hours. */
export async function socialTick() {
  const due = await db
    .update(socialPosts)
    .set({ status: "PUBLISHING" })
    .where(and(eq(socialPosts.status, "SCHEDULED"), eq(socialPosts.channel, "google"), lte(socialPosts.scheduledAt, new Date())))
    .returning({ id: socialPosts.id });
  for (const p of due) await enqueue("publish-post", { postId: p.id });

  const cutoff = new Date(Date.now() - 6 * 3600_000);
  const stale = await db
    .update(integrations)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(integrations.type, "GBP"), sql`coalesce(${integrations.lastSyncedAt}, 'epoch') < ${cutoff}`))
    .returning({ siteId: integrations.siteId });
  for (const s of stale) await enqueue("sync-reviews", { siteId: s.siteId });
}
