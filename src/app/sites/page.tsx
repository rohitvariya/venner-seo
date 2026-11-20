import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logout } from "@/app/actions";
import { AddSiteForm } from "@/components/add-site-form";

export default async function SitesPage() {
  const { user, workspace } = await requireUser();
  const { sites: S, articles: A } = schema;
  const sites = await db
    .select({
      id: S.id,
      domain: S.domain,
      businessName: S.businessName,
      onboardingStep: S.onboardingStep,
      published: sql<number>`count(${A.id}) filter (where ${A.status} = 'PUBLISHED')::int`,
      toReview: sql<number>`count(${A.id}) filter (where ${A.status} = 'REVIEW')::int`,
    })
    .from(S)
    .leftJoin(A, eq(A.siteId, S.id))
    .where(and(eq(S.workspaceId, workspace.id)))
    .groupBy(S.id)
    .orderBy(desc(S.createdAt));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-brand-500">Venner SEO</div>
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
        </div>
        <form action={logout} className="flex items-center gap-3 text-sm text-slate-500">
          {user.email}
          <button className="btn-secondary">Sign out</button>
        </form>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          <h2 className="font-semibold">Websites</h2>
          {sites.length === 0 && <p className="card text-sm text-slate-500">No websites yet. Add your first one.</p>}
          {sites.map((s) => (
            <Link
              key={s.id}
              href={s.onboardingStep === "DONE" ? `/sites/${s.id}` : `/sites/${s.id}/onboarding`}
              className="card flex items-center justify-between hover:border-brand-500"
            >
              <div>
                <div className="font-medium">{s.businessName ?? s.domain}</div>
                <div className="text-sm text-slate-500">{s.domain}</div>
              </div>
              <div className="flex gap-2 text-xs">
                {s.onboardingStep !== "DONE" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Setup unfinished</span>}
                {s.toReview > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{s.toReview} to review</span>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{s.published} published</span>
              </div>
            </Link>
          ))}
        </section>
        <aside className="card h-fit">
          <h2 className="mb-4 font-semibold">Add a website</h2>
          <AddSiteForm />
        </aside>
      </div>
    </div>
  );
}
