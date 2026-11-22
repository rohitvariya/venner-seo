import type { NextRequest } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { articleUrl, type CustomConfig } from "@/lib/publish/custom";
import type { Brief } from "@/lib/seo/writer";
import { CORS, authSite, json, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/v1/articles?page=1&limit=20
 * Lists the site's published articles, newest first (summaries, no body).
 */
export async function GET(req: NextRequest) {
  const site = await authSite(req);
  if (!site) return unauthorized();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 20));
  const A = schema.articles;
  const where = and(eq(A.siteId, site.id), eq(A.status, "PUBLISHED"));

  const [rows, [{ total }], integration] = await Promise.all([
    db.query.articles.findMany({ where, orderBy: desc(A.publishedAt), limit, offset: (page - 1) * limit }),
    db.select({ total: sql<number>`count(*)::int` }).from(A).where(where),
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, site.id), eq(schema.integrations.type, "CUSTOM")) }),
  ]);
  const pattern = (integration?.config as CustomConfig | null)?.urlPattern ?? "";

  return json(
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      articles: rows.map((a) => {
        const brief = a.brief as Brief | null;
        return {
          id: a.id,
          slug: a.slug,
          url: a.publishedUrl ?? (pattern ? articleUrl(pattern, a.slug) : null),
          title: a.title,
          excerpt: a.metaDescription,
          category: brief?.category ?? null,
          tags: brief?.tags ?? [],
          featuredImage: a.heroImageUrl ? { url: a.heroImageUrl, alt: a.title } : null,
          readingTimeMinutes: Math.max(1, Math.round((a.contentMd ?? "").split(/\s+/).filter(Boolean).length / 220)),
          publishedAt: a.publishedAt?.toISOString() ?? null,
          updatedAt: a.updatedAt.toISOString(),
        };
      }),
    },
    200,
    { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  );
}
