import type { Blueprint, Site, Service, ServiceArea, SitePage } from "../schema";
import { structured } from "../ai";
import type { CrawledPage } from "../crawl";

export type BusinessAnalysis = {
  businessName: string;
  category: string;
  summary: string;
  services: { name: string; pageUrl: string | null }[];
  country: string | null;
  state: string | null;
  city: string | null;
  streetAddress: string | null;
  phone: string | null;
  toneOfVoice: string;
  language: string;
  servicePageUrls: string[];
  idealCustomer: string;
  differentiators: string[];
  facts: string[];
  targetSearches: string[];
};

export async function analyzeBusiness(domain: string, pages: CrawledPage[]): Promise<BusinessAnalysis> {
  const corpus = pages
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title ?? ""}\nH1: ${p.h1 ?? ""}\nTEXT: ${p.text.slice(0, 2500)}`)
    .join("\n\n---\n\n")
    .slice(0, 60_000);

  return structured<BusinessAnalysis>({
    system:
      "You analyse small-business websites for a local SEO platform. Extract only facts stated on the site. " +
      "Never invent addresses, phone numbers or services. Use null when something is not on the site.",
    prompt: `Website: ${domain}\n\nCrawled pages:\n\n${corpus}\n\nExtract the business profile. ` +
      "List 6-12 concrete services the business sells (customer-facing names a buyer would search for), " +
      "each with the URL of the page that best describes it, if one exists in the crawl. " +
      "servicePageUrls = crawled URLs that are service or product pages. " +
      "differentiators = reasons customers choose this business, copied as stated on the site, including any " +
      "numbers, years in business, ratings, awards, certifications or client counts (only if the site states them). " +
      "facts = hard facts any article must get right (prices, opening hours, years founded, team size, guarantees, " +
      "qualifications), only if stated. targetSearches = 15-30 short search phrases a buyer would type to find these " +
      "services (lowercase, no brand names).",
    schemaName: "business_profile",
    maxTokens: 6000,
    schema: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        category: { type: "string", description: "Short description, e.g. 'Software development and digital marketing agency'" },
        summary: { type: "string", description: "1-2 sentences on what the business does and for whom" },
        services: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, pageUrl: { type: ["string", "null"] } },
            required: ["name", "pageUrl"],
          },
        },
        country: { type: ["string", "null"] },
        state: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        streetAddress: { type: ["string", "null"] },
        phone: { type: ["string", "null"], description: "With country code if shown" },
        toneOfVoice: { type: "string", description: "How the brand writes, e.g. 'professional, practical, friendly'" },
        language: { type: "string", description: "ISO 639-1 code of the site's main language" },
        servicePageUrls: { type: "array", items: { type: "string" } },
        idealCustomer: { type: "string", description: "Who the business serves, one sentence" },
        differentiators: { type: "array", items: { type: "string" } },
        facts: { type: "array", items: { type: "string" } },
        targetSearches: { type: "array", items: { type: "string" } },
      },
      required: [
        "businessName", "category", "summary", "services", "country", "state", "city",
        "streetAddress", "phone", "toneOfVoice", "language", "servicePageUrls",
        "idealCustomer", "differentiators", "facts", "targetSearches",
      ],
    },
  });
}

/** Compact text block describing the business, injected into every content prompt. */
export function profileContext(
  site: Site,
  services: Service[],
  areas: ServiceArea[],
  pages: Pick<SitePage, "url" | "title" | "isService">[],
  ownArticles: { title: string; url: string }[] = [],
) {
  const bp: Blueprint = site.blueprint;
  const linkable = pages
    .filter((p) => p.isService || /about|contact/i.test(p.url))
    .slice(0, 30)
    .map((p) => `- ${p.title ?? p.url} → ${p.url}`)
    .join("\n");
  const articles = ownArticles
    .slice(0, 40)
    .map((a) => `- ${a.title} → ${a.url}`)
    .join("\n");
  const list = (label: string, items: string[]) => items.length > 0 && `${label}:\n${items.map((i) => `- ${i}`).join("\n")}`;
  return [
    `Business: ${site.businessName ?? site.domain} (${site.domain})`,
    site.category && `Category: ${site.category}`,
    site.summary && `About: ${site.summary}`,
    `Services: ${services.filter((s) => s.selected).map((s) => s.name).join(", ")}`,
    `Location: ${[site.streetAddress, site.city, site.state, site.country].filter(Boolean).join(", ")}`,
    areas.length > 0 && `Service areas: ${areas.map((a) => a.name).join(", ")}`,
    site.phone && `Phone: ${site.phone}`,
    site.toneOfVoice && `Tone of voice: ${site.toneOfVoice}`,
    bp.idealCustomer && `Ideal customer: ${bp.idealCustomer}`,
    list("Why customers choose them (use these proof points; never invent others)", bp.differentiators),
    list("Facts every article MUST get right (never contradict, never invent other numbers)", bp.facts),
    bp.author?.name &&
      `Author: ${bp.author.name}${bp.author.jobTitle ? `, ${bp.author.jobTitle}` : ""}${bp.author.expertise.length ? ` (expertise: ${bp.author.expertise.join(", ")})` : ""}`,
    linkable && `Pages on the site you may link to (internal links):\n${linkable}`,
    articles && `Published blog articles on the site you may link to (related reading):\n${articles}`,
  ]
    .filter(Boolean)
    .join("\n");
}
