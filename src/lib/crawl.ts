import * as cheerio from "cheerio";

export type CrawledPage = {
  url: string;
  title: string | null;
  h1: string | null;
  text: string;
  links: string[];
};

// A normal browser identity: many shared hosts and firewalls block unknown bot user agents.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 VennerSEO/1.0";

let lastFetchError = "";

function describe(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${err.message} (${detail})` : err.message;
}

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d.replace(/^www\./, "");
}

export async function fetchText(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      lastFetchError = `${url} returned HTTP ${res.status}`;
      return null;
    }
    return await res.text();
  } catch (err) {
    lastFetchError = `${url}: ${describe(err)}`;
    return null;
  }
}

function parsePage(url: string, html: string, host: string): CrawledPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, header form").remove();
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, url);
      if (u.hostname.replace(/^www\./, "") !== host) return;
      if (!/^https?:$/.test(u.protocol)) return;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4)$/i.test(u.pathname)) return;
      u.hash = "";
      u.search = "";
      links.add(u.toString());
    } catch {
      /* ignore bad hrefs */
    }
  });
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
  return {
    url,
    title: $("title").first().text().trim() || null,
    h1: $("h1").first().text().trim() || null,
    text,
    links: [...links],
  };
}

async function sitemapUrls(base: string, host: string): Promise<string[]> {
  const xml = await fetchText(`${base}/sitemap.xml`);
  if (!xml) return [];
  const $ = cheerio.load(xml, { xmlMode: true });
  const locs = $("loc").map((_, el) => $(el).text().trim()).get();
  const nested = locs.filter((l) => l.endsWith(".xml")).slice(0, 5);
  const pages = locs.filter((l) => !l.endsWith(".xml"));
  for (const sm of nested) {
    const sub = await fetchText(sm);
    if (!sub) continue;
    const $$ = cheerio.load(sub, { xmlMode: true });
    pages.push(...$$("loc").map((_, el) => $$(el).text().trim()).get());
  }
  return pages.filter((p) => {
    try {
      return new URL(p).hostname.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  });
}

/** Crawls the homepage, sitemap and internal links, preferring service/about/contact pages. */
export async function crawlSite(domain: string, maxPages = 25): Promise<CrawledPage[]> {
  const host = normalizeDomain(domain);
  let base = "";
  let homeHtml: string | null = null;
  const errors: string[] = [];
  for (const candidate of [`https://${host}`, `https://www.${host}`, `http://${host}`]) {
    homeHtml = await fetchText(candidate);
    if (homeHtml) {
      base = candidate;
      break;
    }
    errors.push(lastFetchError);
  }
  if (!homeHtml) {
    console.error(`Crawl failed for ${host}:\n  ${errors.join("\n  ")}`);
    throw new Error(`Could not load ${host}. ${errors[0] ?? ""}`.trim());
  }

  const home = parsePage(base + "/", homeHtml, host);
  const candidates = new Set<string>([...home.links, ...(await sitemapUrls(base, host))]);

  const priority = /(service|solution|about|contact|what-we-do|industr|product|location|pricing)/i;
  const skip = /(\/tag\/|\/category\/|\/author\/|\/page\/\d|\/cart|\/checkout|\/account|\/wp-)/i;
  const ordered = [...candidates]
    .filter((u) => !skip.test(u) && u !== home.url)
    .sort((a, b) => Number(priority.test(b)) - Number(priority.test(a)));

  const pages: CrawledPage[] = [home];
  for (const url of ordered) {
    if (pages.length >= maxPages) break;
    const html = await fetchText(url);
    if (!html) continue;
    const p = parsePage(url, html, host);
    if (p.text.length > 200) pages.push(p);
  }
  return pages;
}

/**
 * Finds the site's blog post URLs: WordPress-style post sitemaps first, then any sitemap URL
 * that looks like an article (/blog/, /news/, /insights/, dated paths).
 */
export async function listPostUrls(domain: string, limit = 30): Promise<string[]> {
  const host = normalizeDomain(domain);
  const base = `https://${host}`;
  const index = await fetchText(`${base}/sitemap_index.xml`) ?? await fetchText(`${base}/sitemap.xml`);
  const posts: string[] = [];
  if (index) {
    const $ = cheerio.load(index, { xmlMode: true });
    const locs = $("loc").map((_, el) => $(el).text().trim()).get();
    const postMaps = locs.filter((l) => l.endsWith(".xml") && /post-sitemap|blog|article|news/i.test(l));
    for (const sm of postMaps.slice(0, 3)) {
      const xml = await fetchText(sm);
      if (!xml) continue;
      const $$ = cheerio.load(xml, { xmlMode: true });
      posts.push(...$$("url > loc").map((_, el) => $$(el).text().trim()).get());
    }
    if (posts.length === 0) {
      posts.push(...(await sitemapUrls(base, host)).filter((u) => /\/(blog|news|insights|articles?|resources)\/.+|\/\d{4}\/\d{2}\//i.test(u)));
    }
  }
  return [...new Set(posts)].filter((u) => !/\/(category|tag|author|page)\//.test(u)).slice(0, limit);
}
