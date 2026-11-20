import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSite } from "@/lib/auth";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { NavLinks } from "@/components/nav-links";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site, workspace } = await requireSite(siteId);
  if (site.onboardingStep !== "DONE") redirect(`/sites/${siteId}/onboarding`);
  const sites = await db.query.sites.findMany({
    where: eq(schema.sites.workspaceId, workspace.id),
    columns: { id: true, domain: true },
    orderBy: asc(schema.sites.domain),
  });
  const [{ toReview }] = await db
    .select({ toReview: sql<number>`count(*)::int` })
    .from(schema.articles)
    .where(and(eq(schema.articles.siteId, siteId), eq(schema.articles.status, "REVIEW")));

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <Link href="/sites" className="mb-6 block font-bold text-brand-500">Venner SEO</Link>
        <div className="mb-6">
          <div className="text-xs uppercase text-slate-400">Website</div>
          <div className="truncate font-medium">{site.businessName ?? site.domain}</div>
          <div className="truncate text-xs text-slate-500">{site.domain}</div>
          {sites.length > 1 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-brand-500">Switch site</summary>
              <ul className="mt-1 space-y-1">
                {sites.filter((s) => s.id !== siteId).map((s) => (
                  <li key={s.id}><Link className="text-slate-600 hover:text-brand-500" href={`/sites/${s.id}`}>{s.domain}</Link></li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <NavLinks siteId={siteId} toReview={toReview} />
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
