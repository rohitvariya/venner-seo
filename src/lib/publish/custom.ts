// Publishing to custom-built sites (Next.js, Laravel, anything):
//  1. Content API (pull): the site fetches published articles with a per-site API key.
//  2. Webhook (push, optional): we POST each article to the site when it's published or
//     sent as a draft, signed with HMAC-SHA256 so the site can verify it came from us.

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Article, Blueprint, Site } from "../schema";
import { articleHtml } from "./html";
import type { Brief } from "../seo/writer";

export type CustomConfig = {
  apiKeyHash: string; // sha256 of the API key; the key itself is only shown once
  apiKeyPrefix: string; // first characters, to help people recognise which key is in use
  urlPattern: string; // e.g. https://example.com/blog/{slug}
  webhookUrl: string; // optional
};
export type CustomSecret = { webhookSecret: string };

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function newApiKey() {
  return `vsk_${crypto.randomBytes(24).toString("base64url")}`;
}

export function newWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}

/** Finds the site a Content API key belongs to (constant-time compare on the stored hash). */
export async function siteForApiKey(key: string | null) {
  if (!key || !key.startsWith("vsk_")) return null;
  const hash = sha256(key);
  const row = await db.query.integrations.findFirst({
    where: and(eq(schema.integrations.type, "CUSTOM"), sql`${schema.integrations.config}->>'apiKeyHash' = ${hash}`),
    with: { site: true },
  });
  if (!row?.config?.apiKeyHash) return null;
  const a = Buffer.from(row.config.apiKeyHash);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? row.site : null;
}

export function articleUrl(pattern: string, slug: string | null) {
  return pattern.replace("{slug}", slug ?? "");
}

/** The article as delivered to custom sites (API responses and webhook payloads). */
export function publicArticle(article: Article, site: Site, opts: { url: string | null; keyword: string | null }) {
  const brief = article.brief as Brief | null;
  const author = (site.blueprint as Blueprint).author;
  const html = articleHtml(article.contentMd ?? "", article.faq, {
    title: article.title,
    description: article.metaDescription,
    url: opts.url,
    heroImageUrl: null,
    author,
    publisher: site.businessName ?? site.domain,
    datePublished: article.publishedAt ?? new Date(),
  });
  const words = (article.contentMd ?? "").split(/\s+/).filter(Boolean).length;
  return {
    id: article.id,
    slug: article.slug,
    url: opts.url,
    status: article.status === "PUBLISHED" ? "published" : "draft",
    title: article.title,
    excerpt: article.metaDescription,
    seo: { title: article.metaTitle || article.title, description: article.metaDescription, focusKeyword: opts.keyword },
    category: brief?.category ?? null,
    tags: brief?.tags ?? [],
    featuredImage: article.heroImageUrl ? { url: article.heroImageUrl, alt: article.title } : null,
    author: author?.name ? { name: author.name, jobTitle: author.jobTitle, bio: author.bio, url: author.aboutUrl || null } : null,
    readingTimeMinutes: Math.max(1, Math.round(words / 220)),
    publishedAt: article.publishedAt?.toISOString() ?? null,
    updatedAt: article.updatedAt.toISOString(),
    faq: article.faq ?? [],
    contentHtml: html, // includes BlogPosting + FAQPage JSON-LD <script> tags at the end
    contentMarkdown: article.contentMd,
  };
}

export type PublicArticle = ReturnType<typeof publicArticle>;

/**
 * Sends a signed webhook. Header X-Venner-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
 * If the site responds with JSON {"url": "..."} we use it as the article's live URL.
 */
export async function sendWebhook(
  url: string,
  secret: string,
  event: "article.published" | "article.draft",
  article: PublicArticle,
): Promise<{ url?: string }> {
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), article });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Venner-Event": event, "X-Venner-Signature": `t=${t},v1=${sig}` },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Webhook ${url} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  try {
    const json = (await res.json()) as { url?: unknown };
    return typeof json.url === "string" && /^https?:\/\//.test(json.url) ? { url: json.url } : {};
  } catch {
    return {};
  }
}
