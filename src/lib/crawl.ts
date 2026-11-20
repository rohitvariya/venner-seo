import * as cheerio from "cheerio";

export type CrawledPage = {
  url: string;
  title: string | null;
  h1: string | null;
  text: string;
  links: string[];
};

const UA = "Mozilla/5.0 (compatible; VennerSEOBot/1.0; +https://vennerinfotech.com)";

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return d.replace(/^www\./, "");
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
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
  let base = `https://${host}`;
  let homeHtml = await fetchText(base);
  if (!homeHtml) {
    base = `https://www.${host}`;
    homeHtml = await fetchText(base);
  }
  if (!homeHtml) throw new Error(`Could not load ${host}. Check the domain is correct and online.`);

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
