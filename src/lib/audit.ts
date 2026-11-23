// Website health audit: crawls up to ~40 pages, runs technical and on-page SEO checks,
// and turns them into a score out of 100 with plain-language problems and fixes.
import * as cheerio from "cheerio";
import { and, desc, eq, gte } from "drizzle-orm";
import { enqueue } from "./queue";
import { db, schema } from "./db";
import { normalizeDomain } from "./crawl";
import type { AuditIssue, AuditSeverity, AuditStats } from "./schema";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 VennerSEO/1.0";
const MAX_PAGES = 40;

type Fetched = { url: string; finalUrl: string; status: number; ms: number; html: string | null; contentType: string };

async function get(url: string, timeoutMs = 20_000): Promise<Fetched> {
  const t = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const html = contentType.includes("html") || contentType.includes("xml") || contentType.includes("text") ? await res.text() : null;
    return { url, finalUrl: res.url || url, status: res.status, ms: Date.now() - t, html, contentType };
  } catch {
    return { url, finalUrl: url, status: 0, ms: Date.now() - t, html: null, contentType: "" };
  }
}

/** Status only (HEAD, falling back to GET) for checking links. */
async function statusOf(url: string): Promise<number> {
  try {
    let res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    }
    return res.status;
  } catch {
    return 0;
  }
}

export type PageFacts = {
  url: string;
  status: number;
  ms: number;
  title: string | null;
  description: string | null;
  h1Count: number;
  words: number;
  imagesWithoutAlt: number;
  images: number;
  canonical: string | null;
  noindex: boolean;
  viewport: boolean;
  lang: boolean;
  jsonLd: boolean;
  ogTitle: boolean;
  mixedContent: number;
  internalLinks: string[];
};

export function pageFacts(url: string, status: number, ms: number, html: string, host: string): PageFacts {
  const $ = cheerio.load(html);
  const internal = new Set<string>();
  $("a[href]").each((_, el) => {
    try {
      const u = new URL($(el).attr("href")!, url);
      if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, "") !== host) return;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|xml)$/i.test(u.pathname)) return;
      u.hash = "";
      internal.add(u.toString());
    } catch {
      /* bad href */
    }
  });
  const imgs = $("img");
  let noAlt = 0;
  imgs.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined || (alt.trim() === "" && $(el).attr("role") !== "presentation")) noAlt++;
  });
  const isHttps = url.startsWith("https://");
  let mixed = 0;
  if (isHttps) $("img[src^='http://'], script[src^='http://'], link[href^='http://'][rel='stylesheet'], iframe[src^='http://']").each(() => void mixed++);
  const robots = ($("meta[name='robots']").attr("content") ?? "").toLowerCase();
  const body = $("body").clone();
  body.find("script, style, noscript, svg").remove();
  const words = body.text().replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
  return {
    url,
    status,
    ms,
    title: $("title").first().text().trim() || null,
    description: $("meta[name='description']").attr("content")?.trim() || null,
    h1Count: $("h1").length,
    words,
    imagesWithoutAlt: noAlt,
    images: imgs.length,
    canonical: $("link[rel='canonical']").attr("href") ?? null,
    noindex: robots.includes("noindex"),
    viewport: $("meta[name='viewport']").length > 0,
    lang: Boolean($("html").attr("lang")),
    jsonLd: $("script[type='application/ld+json']").length > 0,
    ogTitle: $("meta[property='og:title']").length > 0,
    mixedContent: mixed,
    internalLinks: [...internal],
  };
}

async function sitemapUrls(base: string, host: string): Promise<{ found: boolean; urls: string[] }> {
  const r = await get(`${base}/sitemap.xml`);
  const alt = r.status === 200 && r.html?.includes("<loc>") ? r : await get(`${base}/sitemap_index.xml`);
  if (alt.status !== 200 || !alt.html?.includes("<loc>")) return { found: false, urls: [] };
  const $ = cheerio.load(alt.html, { xmlMode: true });
  const locs = $("loc").map((_, el) => $(el).text().trim()).get();
  const pages = locs.filter((l) => !l.endsWith(".xml"));
  for (const sm of locs.filter((l) => l.endsWith(".xml")).slice(0, 6)) {
    const sub = await get(sm);
    if (!sub.html) continue;
    const $$ = cheerio.load(sub.html, { xmlMode: true });
    pages.push(...$$("loc").map((_, el) => $$(el).text().trim()).get());
  }
  return {
    found: true,
    urls: pages.filter((p) => {
      try {
        return new URL(p).host.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    }),
  };
}

/** Google PageSpeed Insights (mobile). Works without a key at low volume; set PAGESPEED_API_KEY for more. */
async function pageSpeed(url: string): Promise<{ score: number | null; lcpMs: number | null; cls: number | null }> {
  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : "";
  const base = process.env.PAGESPEED_API ?? "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  try {
    const res = await fetch(`${base}?url=${encodeURIComponent(url)}&strategy=mobile&category=performance${key}`, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) return { score: null, lcpMs: null, cls: null };
    const j = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { numericValue?: number }> };
    };
    const lh = j.lighthouseResult;
    const s = lh?.categories?.performance?.score;
    return {
      score: typeof s === "number" ? Math.round(s * 100) : null,
      lcpMs: lh?.audits?.["largest-contentful-paint"]?.numericValue ?? null,
      cls: lh?.audits?.["cumulative-layout-shift"]?.numericValue ?? null,
    };
  } catch {
    return { score: null, lcpMs: null, cls: null };
  }
}

/** True when robots.txt's "User-agent: *" group has "Disallow: /" (the whole site). */
export function blocksEverything(txt: string): boolean {
  let inStar = false;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      inStar = (lastWasAgent && inStar) || val === "*";
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (inStar && key === "disallow" && val === "/") return true;
  }
  return false;
}

const WEIGHT: Record<AuditSeverity, number> = { critical: 14, warning: 6, notice: 2 };

/** Score: each problem takes off points by severity, scaled by how much of the site it affects. */
export function scoreIssues(issues: AuditIssue[], pages: number): number {
  let score = 100;
  for (const i of issues) {
    const share = i.id.startsWith("site-") ? 1 : Math.min(1, i.count / Math.max(1, pages));
    score -= WEIGHT[i.severity] * (0.4 + 0.6 * share);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Turns page facts and site checks into issues. Pure, so it can be tested. */
export function buildIssues(
  pages: PageFacts[],
  site: { https: boolean; httpRedirects: boolean; robots: boolean; robotsBlocksAll: boolean; sitemap: boolean; brokenLinks: { url: string; from: string; status: number }[]; mobileScore: number | null },
): { issues: AuditIssue[]; passed: string[] } {
  const issues: AuditIssue[] = [];
  const passed: string[] = [];
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  const add = (id: string, severity: AuditSeverity, affected: string[], title: (n: number) => string, why: string, fix: string, passTitle: string) => {
    if (affected.length === 0) {
      passed.push(passTitle);
      return;
    }
    issues.push({ id, severity, title: title(affected.length), why, fix, pages: affected.slice(0, 25), count: affected.length });
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  // Site-wide
  add("site-https", "critical", site.https ? [] : ["site"], () => "Your website doesn't load over HTTPS",
    "Google ranks secure sites higher and Chrome marks plain-HTTP sites as \"Not secure\", which scares visitors away.",
    "Install an SSL certificate (free with Let's Encrypt; most hosts have a one-click option) and redirect all http:// addresses to https://.",
    "Website loads securely over HTTPS");
  if (site.https) add("site-http-redirect", "warning", site.httpRedirects ? [] : ["site"], () => "http:// doesn't redirect to https://",
    "Two versions of every page split your ranking signals and some visitors land on the insecure one.",
    "Add a permanent (301) redirect from http:// to https:// in your hosting panel, .htaccess or a plugin like Really Simple SSL.",
    "http:// redirects to https://");
  add("site-robots-block", "critical", site.robotsBlocksAll ? ["site"] : [], () => "robots.txt blocks Google from your whole site",
    "With \"Disallow: /\" search engines are told not to crawl any page, so you can't rank.",
    "Edit robots.txt and remove \"Disallow: /\" (in WordPress, untick Settings → Reading → \"Discourage search engines\").",
    "robots.txt lets search engines in");
  add("site-sitemap", "warning", site.sitemap ? [] : ["site"], () => "No XML sitemap found",
    "A sitemap helps Google find and index all your pages, especially new articles.",
    "Turn on the sitemap in Rank Math or Yoast (WordPress) or your platform's SEO settings, then submit /sitemap.xml in Google Search Console.",
    "XML sitemap found");
  add("site-robots", "notice", site.robots ? [] : ["site"], () => "No robots.txt file",
    "Not harmful on its own, but robots.txt is where you point search engines at your sitemap.",
    "Add a robots.txt with \"User-agent: *\", \"Allow: /\" and \"Sitemap: https://yourdomain/sitemap.xml\".",
    "robots.txt present");
  if (site.mobileScore !== null) {
    add("site-mobile-speed", site.mobileScore < 50 ? "critical" : "warning", site.mobileScore < 80 ? ["site"] : [],
      () => `Homepage is slow on mobile (PageSpeed ${site.mobileScore}/100)`,
      "Most of your visitors are on phones. Slow pages rank lower and people leave before they load.",
      "Compress and resize images (WebP), use a caching plugin, remove unused plugins/scripts, and consider a faster host or a CDN like Cloudflare.",
      `Homepage is fast on mobile (PageSpeed ${site.mobileScore}/100)`);
  }

  // Pages
  add("broken-pages", "critical", pages.filter((p) => p.status >= 400 || p.status === 0).map((p) => p.url),
    (n) => `${n} ${plural(n, "page is", "pages are")} broken (error or not found)`,
    "Broken pages waste Google's crawl time and frustrate visitors who click through from search.",
    "Restore the page, or add a 301 redirect to the closest working page and update links pointing to it.",
    "No broken pages");
  add("broken-links", "warning", site.brokenLinks.map((b) => `${b.url} (linked from ${b.from}, ${b.status || "no response"})`),
    (n) => `${n} broken internal ${plural(n, "link", "links")}`,
    "Links to missing pages are a dead end for visitors and for Google.",
    "Update or remove each link, or redirect the missing address to a working page.",
    "No broken internal links");
  add("missing-title", "critical", ok.filter((p) => !p.title).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} no title`,
    "The title is the blue headline in Google results and one of the strongest ranking signals.",
    "Give every page a unique title of 50-60 characters with its main search phrase near the start.",
    "Every page has a title");
  add("long-title", "notice", ok.filter((p) => p.title && p.title.length > 65).map((p) => p.url),
    (n) => `${n} ${plural(n, "title is", "titles are")} too long`,
    "Google cuts titles at about 60 characters, so the end is hidden.",
    "Shorten titles to 50-60 characters, keeping the important words first.",
    "Titles are a good length");
  const titleCounts = new Map<string, string[]>();
  for (const p of ok) if (p.title) titleCounts.set(p.title, [...(titleCounts.get(p.title) ?? []), p.url]);
  add("duplicate-title", "warning", [...titleCounts.values()].filter((v) => v.length > 1).flat(),
    (n) => `${n} pages share the same title`,
    "When pages have the same title Google can't tell which one to show and they compete with each other.",
    "Write a unique title for each page describing what's on that page.",
    "Titles are unique");
  add("missing-meta-description", "warning", ok.filter((p) => !p.description).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} no meta description`,
    "Without one Google picks random text for the snippet under your title, which gets fewer clicks.",
    "Write a 140-160 character description for each page that says what it offers and why to click.",
    "Every page has a meta description");
  add("long-meta-description", "notice", ok.filter((p) => p.description && p.description.length > 165).map((p) => p.url),
    (n) => `${n} meta ${plural(n, "description is", "descriptions are")} too long`,
    "Google cuts descriptions at about 160 characters.",
    "Trim to 140-160 characters.",
    "Meta descriptions are a good length");
  add("missing-h1", "warning", ok.filter((p) => p.h1Count === 0).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} no main heading (H1)`,
    "The H1 tells Google and visitors what the page is about.",
    "Add one H1 heading at the top of each page with its main topic.",
    "Every page has a main heading");
  add("multiple-h1", "notice", ok.filter((p) => p.h1Count > 1).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} more than one H1`,
    "Several main headings blur what the page is about.",
    "Keep one H1 and turn the others into H2 subheadings.",
    "One main heading per page");
  add("thin-content", "warning", ok.filter((p) => p.words < 250 && !p.noindex).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} very little text (under 250 words)`,
    "Pages with little content rarely rank; Google sees them as low value.",
    "Expand them with useful detail: what you offer, who it's for, prices, FAQs, examples. Or merge thin pages together.",
    "Pages have enough content");
  const alt = ok.filter((p) => p.imagesWithoutAlt > 0);
  add("image-alt", "notice", alt.map((p) => `${p.url} (${p.imagesWithoutAlt} of ${p.images})`),
    (n) => `Images without alt text on ${n} ${plural(n, "page", "pages")}`,
    "Alt text helps images show up in Google Images and makes your site accessible to people using screen readers.",
    "Add a short description to each image's alt text (in WordPress: Media Library → Alternative Text).",
    "Images have alt text");
  add("missing-canonical", "notice", ok.filter((p) => !p.canonical).map((p) => p.url),
    (n) => `${n} ${plural(n, "page has", "pages have")} no canonical tag`,
    "A canonical tag stops duplicate versions of a page (with tracking codes, www/non-www) splitting its ranking.",
    "Turn on canonical tags in your SEO plugin (Rank Math and Yoast add them automatically).",
    "Canonical tags set");
  add("noindex", "warning", ok.filter((p) => p.noindex).map((p) => p.url),
    (n) => `${n} ${plural(n, "page is", "pages are")} hidden from Google (noindex)`,
    "These pages tell Google not to show them in search. Fine for thank-you or login pages, a problem for service pages.",
    "If a page should rank, remove the noindex setting in your SEO plugin for that page.",
    "No important pages hidden from Google");
  add("missing-viewport", "critical", ok.filter((p) => !p.viewport).map((p) => p.url),
    (n) => `${n} ${plural(n, "page isn't", "pages aren't")} set up for mobile`,
    "Without a viewport tag phones show a tiny desktop page, and Google ranks by the mobile version.",
    "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to your theme's header (most modern themes have it).",
    "Pages are mobile-friendly");
  add("slow-pages", "warning", ok.filter((p) => p.ms > 3000).map((p) => `${p.url} (${(p.ms / 1000).toFixed(1)}s)`),
    (n) => `${n} ${plural(n, "page takes", "pages take")} over 3 seconds to respond`,
    "Slow server responses hurt rankings and lose visitors.",
    "Use a caching plugin, upgrade hosting, and reduce heavy plugins on those pages.",
    "Pages respond quickly");
  add("mixed-content", "warning", ok.filter((p) => p.mixedContent > 0).map((p) => p.url),
    (n) => `${n} secure ${plural(n, "page loads", "pages load")} insecure files`,
    "Images or scripts loaded over http:// on an https:// page trigger browser warnings and may be blocked.",
    "Change those file addresses to https:// (a plugin like Better Search Replace can do it site-wide).",
    "No insecure files on secure pages");
  const home = ok[0];
  if (home) {
    add("schema-home", "warning", home.jsonLd ? [] : [home.url], () => "Homepage has no structured data (schema)",
      "Schema tells Google and AI assistants your business name, address, phone and services, and can earn rich results.",
      "Add LocalBusiness/Organization schema with name, address, phone, opening hours and logo (Rank Math → Titles & Meta → Local SEO).",
      "Homepage has structured data");
    add("og-tags", "notice", ok.filter((p) => !p.ogTitle).map((p) => p.url),
      (n) => `${n} ${plural(n, "page has", "pages have")} no social sharing tags`,
      "Without Open Graph tags, links shared on WhatsApp, Facebook and LinkedIn show no image or a messy preview.",
      "Turn on Open Graph in your SEO plugin and set a default share image.",
      "Social sharing tags set");
    add("html-lang", "notice", home.lang ? [] : [home.url], () => "Language isn't set on your pages",
      "The lang attribute helps Google serve your pages to the right audience.",
      "Set lang=\"en\" (or your language) on the <html> tag; WordPress does this from Settings → General → Site Language.",
      "Page language set");
  }
  const order: AuditSeverity[] = ["critical", "warning", "notice"];
  issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || b.count - a.count);
  return { issues, passed };
}

/** Runs the audit for a site and stores the result on the given audit row. */
export async function runAudit(auditId: string) {
  const audit = await db.query.siteAudits.findFirst({ where: eq(schema.siteAudits.id, auditId) });
  if (!audit) return;
  const site = await db.query.sites.findFirst({ where: eq(schema.sites.id, audit.siteId) });
  if (!site) return;
  await db.update(schema.siteAudits).set({ status: "RUNNING", error: null }).where(eq(schema.siteAudits.id, auditId));
  try {
    const host = normalizeDomain(site.domain);
    let homeRes: Fetched | null = null;
    for (const c of [`https://${host}`, `https://www.${host}`, `http://${host}`]) {
      const r = await get(c);
      if (r.status >= 200 && r.status < 400 && r.html) {
        homeRes = r;
        break;
      }
    }
    if (!homeRes) throw new Error(`Could not load ${host}. Check the website is online.`);
    const origin = new URL(homeRes.finalUrl).origin;
    const https = origin.startsWith("https://");
    const httpRes = https ? await get(`http://${new URL(origin).host}/`, 12_000) : null;
    const httpRedirects = !https || (httpRes?.finalUrl.startsWith("https://") ?? false);
    const robotsRes = await get(`${origin}/robots.txt`, 10_000);
    const robots = robotsRes.status === 200 && Boolean(robotsRes.html) && !robotsRes.contentType.includes("html");
    const robotsBlocksAll = robots && blocksEverything(robotsRes.html ?? "");
    const sm = await sitemapUrls(origin, host);

    // Pages: homepage, then sitemap URLs and homepage links (services/about first, few blog posts).
    const homeFacts = pageFacts(homeRes.finalUrl, homeRes.status, homeRes.ms, homeRes.html!, host);
    const priority = /(service|solution|about|contact|product|pricing|location|industr|portfolio)/i;
    const skip = /(\/tag\/|\/category\/|\/author\/|\/page\/\d|\/cart|\/checkout|\/account|\/wp-|\/feed)/i;
    const seen = new Set([homeFacts.url.replace(/\/$/, "")]);
    const queue = [...new Set([...homeFacts.internalLinks, ...sm.urls])]
      .filter((u) => !skip.test(u))
      .sort((a, b) => Number(priority.test(b)) - Number(priority.test(a)));
    const pages: PageFacts[] = [homeFacts];
    for (const url of queue) {
      if (pages.length >= MAX_PAGES) break;
      const key = url.replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const r = await get(url);
      if (r.html && r.contentType.includes("html")) pages.push(pageFacts(r.finalUrl, r.status, r.ms, r.html, host));
      else if (r.status >= 400 || r.status === 0) pages.push({ ...pageFacts(url, r.status, r.ms, "<html></html>", host) });
    }

    // Internal links found on audited pages that weren't audited: check their status (capped).
    const linkFrom = new Map<string, string>();
    for (const p of pages) for (const l of p.internalLinks) if (!seen.has(l.replace(/\/$/, "")) && !linkFrom.has(l)) linkFrom.set(l, p.url);
    const brokenLinks: { url: string; from: string; status: number }[] = [];
    for (const [url, from] of [...linkFrom].filter(([u]) => !skip.test(u)).slice(0, 60)) {
      const st = await statusOf(url);
      if (st >= 400 || st === 0) brokenLinks.push({ url, from, status: st });
    }

    const psi = await pageSpeed(homeFacts.url);
    const { issues, passed } = buildIssues(pages, {
      https, httpRedirects, robots, robotsBlocksAll, sitemap: sm.found, brokenLinks, mobileScore: psi.score,
    });
    const okPages = pages.filter((p) => p.status >= 200 && p.status < 300);
    const stats: AuditStats = {
      pagesChecked: pages.length,
      avgResponseMs: okPages.length ? Math.round(okPages.reduce((s, p) => s + p.ms, 0) / okPages.length) : null,
      https, sitemap: sm.found, robots,
      mobileScore: psi.score, lcpMs: psi.lcpMs, cls: psi.cls,
      passed,
    };
    await db
      .update(schema.siteAudits)
      .set({ status: "DONE", score: scoreIssues(issues, pages.length), issues, stats, finishedAt: new Date() })
      .where(eq(schema.siteAudits.id, auditId));
  } catch (err) {
    await db
      .update(schema.siteAudits)
      .set({ status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() })
      .where(eq(schema.siteAudits.id, auditId));
    throw err;
  }
}

export async function latestAudit(siteId: string) {
  return db.query.siteAudits.findFirst({ where: eq(schema.siteAudits.siteId, siteId), orderBy: desc(schema.siteAudits.createdAt) });
}

/** Creates an audit row and queues it. Returns the audit id. */
export async function startAudit(siteId: string) {
  const [row] = await db.insert(schema.siteAudits).values({ siteId, status: "QUEUED" }).returning({ id: schema.siteAudits.id });
  await enqueue("audit-site", { siteId, auditId: row.id });
  return row.id;
}

/** Weekly re-audit for every set-up site (called from the tick). */
export async function queueWeeklyAudits() {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const sites = await db.query.sites.findMany({ where: eq(schema.sites.onboardingStep, "DONE"), columns: { id: true } });
  for (const s of sites) {
    const recent = await db.query.siteAudits.findFirst({
      where: and(eq(schema.siteAudits.siteId, s.id), gte(schema.siteAudits.createdAt, weekAgo)),
      columns: { id: true },
    });
    if (!recent) await startAudit(s.id);
  }
}
