import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { AppShell } from "@/components/shell/app-shell";
import { computeTodos } from "@/lib/todos";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, workspace, user, isClient, clientSiteIds } = await requireSite(siteId);
  if (site.onboardingStep !== "DONE") redirect(`/sites/${siteId}/onboarding`);

  const [sites, [{ toReview }], [{ unreplied }], todos, recentArticles] = await Promise.all([
    db.query.sites.findMany({
      where: isClient ? inArray(schema.sites.id, clientSiteIds!.length ? clientSiteIds! : ["-"]) : eq(schema.sites.workspaceId, workspace.id),
      columns: { id: true, domain: true, businessName: true },
      orderBy: asc(schema.sites.domain),
    }),
    db.select({ toReview: sql<number>`count(*)::int` }).from(schema.articles)
      .where(and(eq(schema.articles.siteId, siteId), eq(schema.articles.status, "REVIEW"))),
    db.select({ unreplied: sql<number>`count(*)::int` }).from(schema.reviews)
      .where(and(eq(schema.reviews.siteId, siteId), sql`${schema.reviews.replyText} is null`)),
    computeTodos(site),
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, siteId), isNotNull(schema.articles.title)),
      columns: { id: true, title: true },
      orderBy: desc(schema.articles.updatedAt),
      limit: 200,
    }),
  ]);

  return (
    <AppShell
      siteId={siteId}
      site={{ id: site.id, domain: site.domain, businessName: site.businessName }}
      sites={sites}
      user={{ name: user.name, email: user.email }}
      counts={isClient ? { todo: toReview, review: toReview, reviews: 0 } : { todo: todos.filter((t) => t.type !== "idea").length, review: toReview, reviews: unreplied }}
      isClient={isClient}
      brand={{ name: workspace.brandName ?? workspace.name, logoUrl: workspace.logoUrl }}
      searchItems={recentArticles.map((a) => ({ label: a.title, href: `/sites/${siteId}/content/${a.id}`, kind: "Article" }))}
    >
      {children}
    </AppShell>
  );
}
