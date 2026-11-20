import type { Site, Service, ServiceArea, SitePage } from "../schema";
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
      "servicePageUrls = crawled URLs that are service or product pages.",
    schemaName: "business_profile",
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
      },
      required: [
        "businessName", "category", "summary", "services", "country", "state", "city",
        "streetAddress", "phone", "toneOfVoice", "language", "servicePageUrls",
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
) {
  const linkable = pages
    .filter((p) => p.isService || /about|contact/i.test(p.url))
    .slice(0, 30)
    .map((p) => `- ${p.title ?? p.url} → ${p.url}`)
    .join("\n");
  return [
    `Business: ${site.businessName ?? site.domain} (${site.domain})`,
    site.category && `Category: ${site.category}`,
    site.summary && `About: ${site.summary}`,
    `Services: ${services.filter((s) => s.selected).map((s) => s.name).join(", ")}`,
    `Location: ${[site.streetAddress, site.city, site.state, site.country].filter(Boolean).join(", ")}`,
    areas.length > 0 && `Service areas: ${areas.map((a) => a.name).join(", ")}`,
    site.phone && `Phone: ${site.phone}`,
    site.toneOfVoice && `Tone of voice: ${site.toneOfVoice}`,
    linkable && `Pages on the site you may link to (internal links):\n${linkable}`,
  ]
    .filter(Boolean)
    .join("\n");
}
