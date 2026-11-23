import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireSitePageForAgency } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { addCompetitor, removeCompetitor, rescanSite } from "@/app/actions";
import { BlueprintForm } from "@/components/blueprint-form";
import { SubmitButton } from "@/components/ui";
import type { Blueprint } from "@/lib/schema";

const TABS = [
  ["customers", "Your customers"],
  ["facts", "Facts"],
  ["searches", "Searches"],
  ["voice", "Voice & author"],
] as const;

/** How complete the Blueprint is: each part makes articles more specific to this business. */
function completeness(bp: Blueprint, tone: string | null) {
  const parts = [
    ["Ideal customer", !!bp.idealCustomer],
    ["Why people choose you (3+)", bp.differentiators.length >= 3],
    ["Facts articles must get right (3+)", bp.facts.length >= 3],
    ["Searches you want to win (10+)", bp.targetSearches.length >= 10],
    ["Tone of voice", !!tone],
    ["Author with bio", !!bp.author?.name && !!bp.author.bio],
    ["Articles you love", bp.likedArticles.length > 0],
  ] as const;
  const done = parts.filter(([, ok]) => ok).length;
  return { pct: Math.round((done / parts.length) * 100), missing: parts.filter(([, ok]) => !ok).map(([l]) => l) };
}

export default async function BusinessPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { siteId } = await params;
  const { tab = "customers" } = await searchParams;
  const { site } = await requireSitePageForAgency(siteId);
  const bp = site.blueprint;
  const [competitors, keywordRows] = await Promise.all([
    db.query.competitors.findMany({ where: eq(schema.competitors.siteId, siteId) }),
    db.query.keywords.findMany({ where: eq(schema.keywords.siteId, siteId), orderBy: asc(schema.keywords.phrase) }),
  ]);
  const volume = new Map(keywordRows.map((k) => [k.phrase, k.searchVolume]));
  const { pct, missing } = completeness(bp, site.toneOfVoice);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Business Blueprint</h1>
          <p className="text-sm text-slate-500">Everything we write is built from this. The more you add, the more articles sound like you.</p>
        </div>
        <form action={rescanSite.bind(null, siteId)}>
          <SubmitButton className="btn-secondary" pending="Queued">Re-read website</SubmitButton>
        </form>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-4 text-sm">
          <span className="shrink-0 whitespace-nowrap font-medium">{pct}% complete</span>
          {missing.length > 0 && <span className="text-right text-slate-500">Missing: {missing.join(" · ")}</span>}
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={`?tab=${id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === id ? "border-brand-500 font-medium text-brand-600" : "border-transparent text-slate-500"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "customers" && (
        <>
          <div className="card">
            <BlueprintForm siteId={siteId}>
              <div>
                <label className="label" htmlFor="idealCustomer">Your ideal customer</label>
                <textarea id="idealCustomer" name="idealCustomer" rows={2} className="input" defaultValue={bp.idealCustomer}
                  placeholder="e.g. Growing D2C brands in India and the US that need a fast Shopify store" />
                <p className="mt-1 text-xs text-slate-500">Who you want more of. We write for them.</p>
              </div>
              <div>
                <label className="label" htmlFor="differentiators">Why people choose you <span className="font-normal text-slate-400">(one per line)</span></label>
                <textarea id="differentiators" name="differentiators" rows={7} className="input" defaultValue={bp.differentiators.join("\n")}
                  placeholder={"250+ projects delivered since 2017\nIn-house team of 30 in Surat\n…"} />
                <p className="mt-1 text-xs text-slate-500">Include numbers, awards and press that back it up. Articles only use proof points listed here.</p>
              </div>
            </BlueprintForm>
          </div>
          <div className="card space-y-3">
            <h2 className="font-semibold">Competitors</h2>
            <p className="text-sm text-slate-500">Businesses customers compare you with.</p>
            {competitors.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>{c.name} <span className="text-slate-400">· {c.domain}</span></span>
                <form action={removeCompetitor.bind(null, siteId, c.id)}><button className="text-slate-400 hover:text-red-500">Remove</button></form>
              </div>
            ))}
            <form action={addCompetitor.bind(null, siteId)} className="flex gap-2">
              <input name="name" className="input" placeholder="Name" required />
              <input name="domain" className="input" placeholder="domain.com" required />
              <button className="btn-secondary">Add</button>
            </form>
          </div>
        </>
      )}

      {tab === "facts" && (
        <div className="card">
          <BlueprintForm siteId={siteId}>
            <div>
              <label className="label" htmlFor="facts">Facts every article must get right <span className="font-normal text-slate-400">(one per line)</span></label>
              <textarea id="facts" name="facts" rows={12} className="input" defaultValue={bp.facts.join("\n")}
                placeholder={"Founded in 2017\nOffice hours: Mon–Sat, 10am–7pm IST\nShopify stores start from ₹20,000\n…"} />
              <p className="mt-1 text-xs text-slate-500">
                Prices, opening days, qualifications, guarantees. Every new article is fact-checked against this list, and anything it can&apos;t back up is flagged for you before publishing.
              </p>
            </div>
          </BlueprintForm>
        </div>
      )}

      {tab === "searches" && (
        <div className="card">
          <BlueprintForm siteId={siteId}>
            <div>
              <label className="label" htmlFor="targetSearches">What you want to be found for <span className="font-normal text-slate-400">(one per line)</span></label>
              <textarea id="targetSearches" name="targetSearches" rows={14} className="input font-mono text-sm" defaultValue={bp.targetSearches.join("\n")} />
              <p className="mt-1 text-xs text-slate-500">The searches you want to win. New content plans grow long-tail topics around these.</p>
            </div>
            {bp.targetSearches.some((t) => volume.get(t) != null) && (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400"><tr><th className="py-1">Search</th><th className="py-1 text-right">Searches / month</th></tr></thead>
                <tbody>
                  {bp.targetSearches.map((t) => (
                    <tr key={t} className="border-t border-slate-100"><td className="py-1">{t}</td><td className="py-1 text-right">{volume.get(t)?.toLocaleString() ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </BlueprintForm>
        </div>
      )}

      {tab === "voice" && (
        <div className="card">
          <BlueprintForm siteId={siteId}>
            <h2 className="font-semibold">How you sound</h2>
            <div>
              <label className="label" htmlFor="toneOfVoice">Tone</label>
              <input id="toneOfVoice" name="toneOfVoice" className="input" defaultValue={site.toneOfVoice ?? ""} placeholder="Expert and detailed, practical, friendly" />
            </div>
            <div>
              <label className="label" htmlFor="likedArticles">Articles you love <span className="font-normal text-slate-400">(up to 5 links)</span></label>
              <textarea id="likedArticles" name="likedArticles" rows={3} className="input" defaultValue={bp.likedArticles.join("\n")} placeholder="https://…" />
            </div>
            <h2 className="pt-2 font-semibold">Who writes</h2>
            <p className="-mt-3 text-sm text-slate-500">Shown on every article with a bio box and author schema. A real person builds trust with Google and readers.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="authorName">Name</label>
                <input id="authorName" name="authorName" className="input" defaultValue={bp.author?.name ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="authorJobTitle">Job title</label>
                <input id="authorJobTitle" name="authorJobTitle" className="input" defaultValue={bp.author?.jobTitle ?? ""} placeholder="Founder & CEO" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="authorBio">Short bio</label>
              <textarea id="authorBio" name="authorBio" rows={3} className="input" defaultValue={bp.author?.bio ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="authorExpertise">Expertise and qualifications <span className="font-normal text-slate-400">(one per line)</span></label>
              <textarea id="authorExpertise" name="authorExpertise" rows={3} className="input" defaultValue={bp.author?.expertise.join("\n") ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="authorAboutUrl">Website or About page</label>
                <input id="authorAboutUrl" name="authorAboutUrl" className="input" defaultValue={bp.author?.aboutUrl ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor="authorLinkedin">LinkedIn</label>
                <input id="authorLinkedin" name="authorLinkedin" className="input" defaultValue={bp.author?.linkedin ?? ""} />
              </div>
            </div>
          </BlueprintForm>
        </div>
      )}
    </div>
  );
}
