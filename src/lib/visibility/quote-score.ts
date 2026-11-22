// "How likely is AI to quote this page?" — 0-10 from five checks, 2 points each:
// structured data, FAQ, sources, a clear opening, and freshness.

import * as cheerio from "cheerio";
import type { QuoteCheck } from "../schema";

const YEAR_MS = 365 * 86400_000;

function score(checks: QuoteCheck[]) {
  return checks.filter((c) => c.passed).length * 2;
}

/** For articles written in Venner SEO (markdown). Schema is added at publish time, so it always passes. */
export function quoteScoreForArticle(contentMd: string, siteDomain: string, updatedAt: Date) {
  const links = [...contentMd.matchAll(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  const external = links.filter((l) => !l.includes(siteDomain));
  const firstPara = contentMd.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#")) ?? "";
  const checks: QuoteCheck[] = [
    { id: "schema", label: "Structured data", passed: true, tip: "Article + FAQ schema are added when published." },
    {
      id: "faq",
      label: "FAQ section",
      passed: /^#{2,3}\s+(frequently asked questions|faq)/im.test(contentMd),
      tip: "Add a 'Frequently asked questions' section with short, direct answers.",
    },
    {
      id: "sources",
      label: "Cites sources",
      passed: external.length >= 2,
      tip: "Link to 2+ trustworthy outside sources (official docs, standards, research) for the claims you make.",
    },
    clearOpening(firstPara),
    { id: "fresh", label: "Recently updated", passed: Date.now() - updatedAt.getTime() < YEAR_MS, tip: "Refresh the article: it's over a year old." },
  ];
  return { score: score(checks), checks };
}

function clearOpening(firstPara: string): QuoteCheck {
  const words = firstPara.replace(/[*_`#>[\]()]/g, " ").split(/\s+/).filter(Boolean).length;
  const answers = /\b(is|are|means|refers to|costs?|takes?|involves|helps)\b/i.test(firstPara);
  return {
    id: "opening",
    label: "Clear opening answer",
    passed: words >= 15 && words <= 90 && answers,
    tip: "Start with a 2-3 sentence direct answer (40-80 words) that AI can quote on its own.",
  };
}

/** For existing blog posts on the website (live HTML). */
export function quoteScoreForHtml(html: string, url: string) {
  const $ = cheerio.load(html);
  const pageHost = new URL(url).hostname.replace(/^www\./, "");
  const ld = $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get().join(" ");
  const hasArticleSchema = /"@type"\s*:\s*"(Article|BlogPosting|NewsArticle|TechArticle)"/.test(ld);
  const hasFaqSchema = /"@type"\s*:\s*"FAQPage"/.test(ld);
  const body = $("article").first().length ? $("article").first() : $(".entry-content, .post-content, main").first();
  const scope = body.length ? body : $("body");
  const headings = scope.find("h2, h3").map((_, el) => $(el).text().trim()).get();
  const hasFaq = hasFaqSchema || headings.some((h) => /faq|frequently asked/i.test(h)) || headings.filter((h) => h.endsWith("?")).length >= 3;
  const external = new Set(
    scope
      .find("a[href^='http']")
      .map((_, el) => $(el).attr("href") ?? "")
      .get()
      .filter((h) => {
        try {
          const host = new URL(h).hostname.replace(/^www\./, "");
          return host !== pageHost && !/facebook|twitter|x\.com|linkedin|instagram|youtube|whatsapp|pinterest/.test(host);
        } catch {
          return false;
        }
      }),
  );
  const firstPara = scope.find("p").filter((_, el) => $(el).text().trim().length > 60).first().text().trim();
  const modified =
    $('meta[property="article:modified_time"]').attr("content") ??
    $('meta[property="article:published_time"]').attr("content") ??
    ld.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1] ??
    ld.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
  const modifiedAt = modified ? new Date(modified) : null;

  const checks: QuoteCheck[] = [
    { id: "schema", label: "Structured data", passed: hasArticleSchema, tip: "Add Article/BlogPosting JSON-LD (Rank Math or Yoast can do this)." },
    { id: "faq", label: "FAQ section", passed: hasFaq, tip: "Add an FAQ section with question headings and short answers (and FAQPage schema)." },
    { id: "sources", label: "Cites sources", passed: external.size >= 2, tip: "Link to 2+ trustworthy outside sources for the claims you make." },
    clearOpening(firstPara),
    {
      id: "fresh",
      label: "Recently updated",
      passed: !!modifiedAt && !Number.isNaN(modifiedAt.getTime()) && Date.now() - modifiedAt.getTime() < YEAR_MS,
      tip: modifiedAt ? "Refresh this post: it hasn't been updated in over a year." : "Show a 'last updated' date (article:modified_time).",
    },
  ];
  return { title: $("h1").first().text().trim() || $("title").text().trim() || url, score: score(checks), checks };
}
