import Link from "next/link";
import { marked } from "marked";
import { requireSite } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  addArea, addCompetitor, addService, completeOnboarding, finishOnboarding, removeArea, removeCompetitor,
  rescanSite, saveContact, setStep, toggleService,
} from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import { ScoreBadge } from "@/components/badges";

const STEPS = ["Website", "Services", "Competitors", "Contact", "Service areas", "First content"];

export default async function OnboardingPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSite(siteId);
  const [services, competitors, areas] = await Promise.all([
    db.query.services.findMany({ where: eq(schema.services.siteId, siteId), orderBy: asc(schema.services.name) }),
    db.query.competitors.findMany({ where: eq(schema.competitors.siteId, siteId) }),
    db.query.serviceAreas.findMany({ where: eq(schema.serviceAreas.siteId, siteId) }),
  ]);
  const scanning = site.scanStatus === "QUEUED" || site.scanStatus === "RUNNING";
  const stepIndex = { WEBSITE: 0, SERVICES: 1, COMPETITORS: 2, CONTACT: 3, AREAS: 4, FIRST_CONTENT: 5, DONE: 5 }[site.onboardingStep];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/sites" className="font-bold text-brand-500">Venner SEO</Link>
        <div className="w-64 text-center">
          <div className="text-sm text-slate-500">Step {stepIndex + 1} of 6 · {STEPS[stepIndex]}</div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${((stepIndex + 1) / 6) * 100}%` }} />
          </div>
        </div>
        <span className="w-24" />
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {stepIndex === 1 && scanning && (
          <div className="card text-center">
            <AutoRefresh active />
            <h1 className="text-2xl font-semibold">Reading {site.domain}…</h1>
            <ul className="mx-auto mt-6 w-fit space-y-2 text-left text-sm text-slate-600">
              <li>• Reading your pages</li>
              <li>• Finding your services</li>
              <li>• Looking for competitors near you</li>
            </ul>
            <p className="mt-6 text-xs text-slate-400">This usually takes under a minute.</p>
            {Date.now() - site.updatedAt.getTime() > 3 * 60_000 && (
              <form action={rescanSite.bind(null, siteId)} className="mt-4">
                <p className="mb-2 text-sm text-amber-700">This is taking longer than expected. Make sure the worker (npm run worker) is running.</p>
                <SubmitButton className="btn-secondary">Restart scan</SubmitButton>
              </form>
            )}
          </div>
        )}

        {stepIndex === 1 && site.scanStatus === "FAILED" && (
          <div className="card space-y-4 text-center">
            <h1 className="text-xl font-semibold">We couldn&apos;t read {site.domain}</h1>
            <p className="text-sm text-red-600">{site.scanError}</p>
            <form action={rescanSite.bind(null, siteId)}>
              <SubmitButton>Try again</SubmitButton>
            </form>
          </div>
        )}

        {stepIndex === 1 && site.scanStatus === "DONE" && (
          <section className="space-y-6">
            <div className="text-center">
              <div className="text-sm font-medium text-brand-500">{site.businessName}</div>
              <h1 className="text-3xl font-semibold">Confirm what your business offers</h1>
              <p className="mt-2 text-slate-500">We plan your articles around these. Tap to add or remove.</p>
            </div>
            <div className="card text-sm">
              <div className="font-medium">{site.category} · {site.domain}</div>
              <p className="mt-1 text-slate-600">{site.summary}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {services.map((s) => (
                <form key={s.id} action={toggleService.bind(null, siteId, s.id)}>
                  <button
                    className={`rounded-lg px-3 py-1.5 text-sm ${s.selected ? "bg-brand-50 text-brand-600 ring-1 ring-brand-100" : "bg-white text-slate-400 ring-1 ring-slate-200 line-through"}`}
                  >
                    {s.selected ? "✓ " : ""}{s.name}
                  </button>
                </form>
              ))}
            </div>
            <form action={addService.bind(null, siteId)} className="flex gap-2">
              <input name="name" className="input" placeholder="Something missing? e.g. Shopify development" />
              <button className="btn-secondary">+ Add</button>
            </form>
            <div className="flex justify-end">
              <form action={setStep.bind(null, siteId, "COMPETITORS")}>
                <SubmitButton>Continue →</SubmitButton>
              </form>
            </div>
          </section>
        )}

        {stepIndex === 2 && (
          <section className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-semibold">Who are your closest competitors?</h1>
              <p className="mt-2 text-slate-500">We compare you with them on Google. Optional, and you can change these later.</p>
            </div>
            <div className="space-y-2">
              {competitors.map((c) => (
                <div key={c.id} className="card flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-slate-500">{c.domain}</div>
                  </div>
                  <form action={removeCompetitor.bind(null, siteId, c.id)}>
                    <button className="text-slate-400 hover:text-red-500" aria-label={`Remove ${c.name}`}>✕</button>
                  </form>
                </div>
              ))}
              {competitors.length === 0 && <p className="text-center text-sm text-slate-400">No competitors yet. Add a few below.</p>}
            </div>
            <form action={addCompetitor.bind(null, siteId)} className="flex gap-2">
              <input name="name" className="input" placeholder="Their name" required />
              <input name="domain" className="input" placeholder="theirbusiness.com" required />
              <button className="btn-secondary">+ Add</button>
            </form>
            <div className="flex justify-between">
              <form action={setStep.bind(null, siteId, "SERVICES")}><button className="btn-secondary">← Back</button></form>
              <form action={setStep.bind(null, siteId, "CONTACT")}><SubmitButton>Continue →</SubmitButton></form>
            </div>
          </section>
        )}

        {stepIndex === 3 && (
          <form action={saveContact.bind(null, siteId)} className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-semibold">Where can customers find you?</h1>
              <p className="mt-2 text-slate-500">Used for local searches and in your articles&apos; calls to action.</p>
            </div>
            <div className="card grid gap-4 sm:grid-cols-2">
              {[
                ["businessName", "Business name", site.businessName],
                ["country", "Country", site.country],
                ["streetAddress", "Street address", site.streetAddress],
                ["city", "City", site.city],
                ["state", "State or province", site.state],
                ["phone", "Phone", site.phone],
              ].map(([name, label, value]) => (
                <div key={name}>
                  <label className="label" htmlFor={name!}>{label}</label>
                  <input className="input" id={name!} name={name!} defaultValue={value ?? ""} required={name === "city" || name === "phone"} />
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button formAction={setStep.bind(null, siteId, "COMPETITORS")} formNoValidate className="btn-secondary">← Back</button>
              <SubmitButton>Continue →</SubmitButton>
            </div>
          </form>
        )}

        {stepIndex === 4 && (
          <section className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-semibold">Where do you serve customers?</h1>
              <p className="mt-2 text-slate-500">Add the cities or areas you work in. We use them for local articles.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => (
                <form key={a.id} action={removeArea.bind(null, siteId, a.id)}>
                  <button className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm text-brand-600">{a.name} ✕</button>
                </form>
              ))}
            </div>
            <form action={addArea.bind(null, siteId)} className="flex gap-2">
              <input name="name" className="input" placeholder="e.g. Ahmedabad" required />
              <button className="btn-secondary">+ Add</button>
            </form>
            <div className="flex justify-between">
              <form action={setStep.bind(null, siteId, "CONTACT")}><button className="btn-secondary">← Back</button></form>
              <form action={finishOnboarding.bind(null, siteId)}><SubmitButton pending="Planning…">Build my content plan →</SubmitButton></form>
            </div>
          </section>
        )}

        {stepIndex === 5 && <FirstContent siteId={siteId} />}
      </main>
    </div>
  );
}

async function FirstContent({ siteId }: { siteId: string }) {
  const articles = await db.query.articles.findMany({
    where: eq(schema.articles.siteId, siteId),
    orderBy: asc(schema.articles.plannedFor),
    limit: 20,
  });
  const first = articles.find((a) => a.status === "REVIEW");
  const busy = !first && !articles.some((a) => a.status === "FAILED");
  return (
    <section className="space-y-6">
      <AutoRefresh active={busy} />
      <div className="text-center">
        <div className="text-sm font-medium text-brand-500">{first ? "Your content is ready" : "Working on it"}</div>
        <h1 className="text-3xl font-semibold">{first ? "Meet your first article" : "Writing your first article…"}</h1>
        <p className="mt-2 text-slate-500">
          {first
            ? "This is the kind of content we'll create every week. Nothing goes live without your OK."
            : articles.length === 0
              ? "Researching keywords and building your content calendar."
              : `${articles.length} articles planned. The first draft takes about a minute.`}
        </p>
      </div>
      {first && (
        <div className="card space-y-2">
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">Article</span>
            <ScoreBadge score={first.seoScore} />
          </div>
          <h2 className="text-xl font-semibold">{first.title}</h2>
          <p className="text-sm text-slate-600">{first.metaDescription}</p>
          <details className="pt-2">
            <summary className="btn-secondary w-full cursor-pointer list-none">Read the full article</summary>
            <article className="prose-article mt-4" dangerouslySetInnerHTML={{ __html: marked.parse(first.contentMd ?? "", { async: false }) as string }} />
          </details>
        </div>
      )}
      {articles.some((a) => a.status === "FAILED") && !first && (
        <p className="text-center text-sm text-red-600">Writing failed: {articles.find((a) => a.status === "FAILED")?.error}</p>
      )}
      <div className="flex justify-end">
        <form action={completeOnboarding.bind(null, siteId)}>
          <SubmitButton>Go to dashboard →</SubmitButton>
        </form>
      </div>
    </section>
  );
}
