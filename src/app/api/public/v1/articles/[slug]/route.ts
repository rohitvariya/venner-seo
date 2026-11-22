import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { articleUrl, publicArticle, type CustomConfig } from "@/lib/publish/custom";
import { CORS, authSite, json, unauthorized } from "../../_shared";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/v1/articles/{slug}
 * Full published article: HTML (with BlogPosting + FAQ JSON-LD), markdown, SEO fields, FAQ, author.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const site = await authSite(req);
  if (!site) return unauthorized();
  const { slug } = await params;
  const A = schema.articles;
  const article = await db.query.articles.findFirst({
    where: and(eq(A.siteId, site.id), eq(A.slug, slug), eq(A.status, "PUBLISHED")),
    with: { keyword: true },
  });
  if (!article) return json({ error: "Article not found" }, 404);
  const integration = await db.query.integrations.findFirst({
    where: and(eq(schema.integrations.siteId, site.id), eq(schema.integrations.type, "CUSTOM")),
  });
  const pattern = (integration?.config as CustomConfig | null)?.urlPattern ?? "";
  const url = article.publishedUrl ?? (pattern ? articleUrl(pattern, article.slug) : null);
  return json(publicArticle(article, site, { url, keyword: article.keyword?.phrase ?? null }), 200, {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  });
}
