import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";

export type PublicTestimonial = { name: string; rating: number; text: string; date: string | null };

/** Testimonials picked for the website widget, newest first. Public: only name, stars, text, date. */
export async function testimonialsForKey(key: string) {
  if (!/^w_[A-Za-z0-9_-]{6,}$/.test(key)) return null;
  const site = await db.query.sites.findFirst({ where: eq(schema.sites.widgetKey, key), columns: { id: true, businessName: true, domain: true } });
  if (!site) return null;
  const rows = await db.query.reviews.findMany({
    where: and(eq(schema.reviews.siteId, site.id), eq(schema.reviews.isTestimonial, true)),
    orderBy: desc(schema.reviews.reviewedAt),
    limit: 30,
  });
  const all = await db.query.reviews.findMany({ where: eq(schema.reviews.siteId, site.id), columns: { rating: true } });
  return {
    business: site.businessName ?? site.domain,
    average: all.length ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10 : null,
    total: all.length,
    testimonials: rows
      .filter((r) => r.comment)
      .map<PublicTestimonial>((r) => ({ name: r.reviewer ?? "Google user", rating: r.rating, text: r.comment!, date: r.reviewedAt?.toISOString().slice(0, 10) ?? null })),
  };
}
