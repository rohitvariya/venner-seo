import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { requireSitePageForAgency } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { createArticleFromTopic, draftEventPost, startGrow, toggleGrowDone } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import { latestGrow, type ConversationsData, type DirectoriesData, type EventsData, type GrowKind, type PlanData, type ReportData } from "@/lib/grow/jobs";
import type { SearchKeyword } from "@/lib/gbp";

const SECTIONS: Record<string, { title: string; intro: string; kind?: GrowKind; button?: string; wait?: string }> = {
  plan: { title: "30-day plan", intro: "A week-by-week plan made from your numbers and open problems. Tick tasks off as you go.", kind: "plan", button: "Make my plan", wait: "Reading your numbers and writing the plan… (about 30 seconds)" },
  ideas: { title: "Ideas", intro: "Topics people already search for or ask AI about, that you don't have an article for yet." },
  conversations: { title: "Conversations", intro: "Questions people are asking online that you can answer. A helpful reply builds trust, links and AI mentions.", kind: "conversations", button: "Find conversations", wait: "Searching Reddit, Quora and forums… (about a minute)" },
  directories: { title: "Directories", intro: "Listing sites that Google and AI assistants trust. Being listed (with the same name, address and phone) helps you rank.", kind: "directories", button: "Check directories", wait: "Checking where you're listed… (about a minute)" },
  events: { title: "Events & holidays", intro: "Occasions coming up in the next 10 weeks, with a post idea for each. Draft a Google post in one click.", kind: "events", button: "Find upcoming occasions", wait: "Checking this year's dates… (about 30 seconds)" },
  report: { title: "Growth report", intro: "Your last 30 days compared with the 30 before, in plain words. A new report is made on the 1st of each month.", kind: "report", button: "Make report now", wait: "Adding up your numbers… (about 20 seconds)" },
};

const AREA_LABEL: Record<string, string> = { content: "Content", google: "Google profile", reviews: "Reviews", website: "Website", ai: "AI answers", social: "Social" };

function Delta({ now, before, better = "up", unit = "" }: { now: number | null; before: number | null; better?: "up" | "down"; unit?: string }) {
  if (now === null || before === null || before === now) return <span className="text-xs text-slate-400">{before === now && now !== null ? "no change" : ""}</span>;
  const diff = Math.round((now - before) * 10) / 10;
  const good = better === "up" ? diff > 0 : diff < 0;
  return <span className={`text-xs ${good ? "text-green-700" : "text-red-700"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}{unit} vs {before}{unit}</span>;
}

export default async function GrowSection({ params }: { params: Promise<{ siteId: string; section: string }> }) {
  const { siteId, section } = await params;
  const meta = SECTIONS[section];
  if (!meta) notFound();
  const { site } = await requireSitePageForAgency(siteId);
  const state = meta.kind ? await latestGrow<unknown>(siteId, meta.kind) : null;
  const generate = meta.kind ? startGrow.bind(null, siteId, meta.kind) : null;

  return (
    <div className="space-y-6">
      <AutoRefresh active={!!state?.running} intervalMs={4000} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{meta.title}</h1>
          <p className="max-w-2xl text-sm text-slate-500">{meta.intro}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          {section === "report" && state?.data ? <PrintButton /> : null}
          {generate && (
            <form action={generate}>
              <SubmitButton className={state?.data ? "btn-secondary" : "btn-primary"} pending="Starting…">{state?.data ? "Make a new one" : meta.button}</SubmitButton>
            </form>
          )}
        </div>
      </div>
      {state?.running && (
        <div className="card flex items-center gap-3 text-sm text-slate-600"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />{meta.wait}</div>
      )}
      {state?.error && !state.running && <div className="card border-red-200 bg-red-50 text-sm text-red-700">That didn&apos;t work: {state.error}</div>}
      {state && !state.data && !state.running && !state.error && (
        <div className="card py-10 text-center text-sm text-slate-500">Nothing here yet. Click &quot;{meta.button}&quot; to start.</div>
      )}

      {section === "plan" && state?.data ? <Plan siteId={siteId} data={state.data as PlanData} /> : null}
      {section === "report" && state?.data ? <Report data={state.data as ReportData} name={site.businessName ?? site.domain} made={state.row!.createdAt} /> : null}
      {section === "conversations" && state?.data ? <Conversations data={state.data as ConversationsData} /> : null}
      {section === "directories" && state?.data ? <Directories siteId={siteId} data={state.data as DirectoriesData} /> : null}
      {section === "events" && state?.data ? <Events siteId={siteId} data={state.data as EventsData} /> : null}
      {section === "ideas" && <Ideas siteId={siteId} />}
    </div>
  );
}

function Plan({ siteId, data }: { siteId: string; data: PlanData }) {
  const all = data.weeks.flatMap((w) => w.tasks);
  const done = new Set(data.done);
  const pct = all.length ? Math.round((all.filter((t) => done.has(t.id)).length / all.length) * 100) : 0;
  return (
    <>
      <div className="card space-y-3">
        <p className="text-sm text-slate-700">{data.summary}</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
          <span className="text-sm font-medium">{pct}% done</span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.weeks.map((w) => (
          <div key={w.week} className="card">
            <div className="mb-3"><div className="text-xs uppercase tracking-wide text-slate-400">Week {w.week}</div><div className="font-semibold">{w.focus}</div></div>
            <ul className="space-y-2">
              {w.tasks.map((t) => (
                <li key={t.id}>
                  <form action={toggleGrowDone.bind(null, siteId, "plan", t.id)} className="flex gap-2">
                    <button type="submit" className="mt-0.5 shrink-0" aria-label={done.has(t.id) ? "Mark not done" : "Mark done"}>
                      {done.has(t.id) ? <CheckCircle2 size={18} className="text-green-600" /> : <Circle size={18} className="text-slate-300 hover:text-brand-500" />}
                    </button>
                    <div className="text-sm">
                      <div className={done.has(t.id) ? "text-slate-400 line-through" : "font-medium"}>{t.title}</div>
                      <div className="text-xs text-slate-500">{t.why} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{AREA_LABEL[t.area] ?? t.area}</span></div>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function Report({ data, name, made }: { data: ReportData; name: string; made: Date }) {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-xs text-slate-400">{name} · {fmt(data.period.from)} – {fmt(data.period.to)} · made {made.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{data.summary}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.filter((m) => m.now !== null).map((m) => (
          <div key={m.label} className="card">
            <div className="text-xs text-slate-500">{m.label}</div>
            <div className="mt-1 text-2xl font-semibold">{m.now?.toLocaleString()}{m.unit}</div>
            <Delta now={m.now} before={m.before} better={m.better} unit={m.unit} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card"><h2 className="mb-2 font-semibold">Wins</h2><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{data.wins.map((w) => <li key={w}>{w}</li>)}</ul></div>
        <div className="card"><h2 className="mb-2 font-semibold">Next month</h2><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{data.next.map((w) => <li key={w}>{w}</li>)}</ul></div>
      </div>
    </div>
  );
}

function Conversations({ data }: { data: ConversationsData }) {
  if (!data.items.length) return <div className="card text-sm text-slate-500">No conversations found this time. Try again in a week.</div>;
  return (
    <div className="space-y-3">
      {data.items.map((c) => (
        <div key={c.url} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{c.platform}</span>
              <a href={c.url} target="_blank" rel="noreferrer" className="ml-2 font-medium hover:underline">{c.title}</a>
            </div>
            <a href={c.url} target="_blank" rel="noreferrer" className="btn-secondary shrink-0 text-xs"><ExternalLink size={12} />Open</a>
          </div>
          <p className="text-sm text-slate-600">{c.summary}</p>
          <details>
            <summary className="cursor-pointer text-sm text-brand-600">Suggested reply</summary>
            <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{c.suggestedReply}</p>
            <p className="mt-1 text-xs text-slate-400">Edit it in your own words before posting, and say that you run the business.</p>
          </details>
        </div>
      ))}
    </div>
  );
}

function Directories({ siteId, data }: { siteId: string; data: DirectoriesData }) {
  const done = new Set(data.done);
  const listed = data.items.filter((d) => d.listed === "yes" || done.has(d.name)).length;
  const order = { high: 0, medium: 1, low: 2 };
  return (
    <>
      <div className="card text-sm">
        Listed on <span className="font-semibold">{listed}</span> of {data.items.length}. Use exactly the same business name, address and phone everywhere.
      </div>
      <div className="card p-0">
        <ul className="divide-y">
          {[...data.items].sort((a, b) => order[a.priority] - order[b.priority]).map((d) => {
            const isListed = d.listed === "yes" || done.has(d.name);
            return (
              <li key={d.name} className="flex items-start gap-3 px-5 py-3">
                <form action={toggleGrowDone.bind(null, siteId, "directories", d.name)} className="mt-0.5">
                  <button type="submit" aria-label={isListed ? "Mark not listed" : "Mark listed"} disabled={d.listed === "yes"}>
                    {isListed ? <CheckCircle2 size={18} className="text-green-600" /> : <Circle size={18} className="text-slate-300 hover:text-brand-500" />}
                  </button>
                </form>
                <div className="flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={d.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.name}</a>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.priority === "high" ? "bg-red-50 text-red-700" : d.priority === "medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{d.priority}</span>
                    {d.listed === "yes" && <span className="text-xs text-green-700">Found your listing</span>}
                    {d.listed === "unknown" && !done.has(d.name) && <span className="text-xs text-slate-400">Couldn&apos;t tell</span>}
                  </div>
                  <div className="text-xs text-slate-500">{d.why}</div>
                  {d.profileUrl && <a href={d.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600">Your listing →</a>}
                </div>
                {!isListed && <a href={d.url} target="_blank" rel="noreferrer" className="btn-secondary shrink-0 text-xs">Add listing</a>}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function Events({ siteId, data }: { siteId: string; data: EventsData }) {
  if (!data.items.length) return <div className="card text-sm text-slate-500">No occasions found in the next 10 weeks.</div>;
  const drafted = new Set(data.drafted);
  return (
    <div className="card p-0">
      <ul className="divide-y">
        {data.items.map((e) => {
          const key = `${e.date}|${e.name}`;
          return (
            <li key={key} className="flex flex-wrap items-center gap-4 px-5 py-3">
              <div className="w-16 shrink-0 text-center">
                <div className="text-xs uppercase text-slate-400">{new Date(e.date).toLocaleDateString("en-GB", { month: "short" })}</div>
                <div className="text-2xl font-semibold">{Number(e.date.slice(8))}</div>
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{e.name}</div>
                <div className="text-slate-500">{e.idea}</div>
              </div>
              {drafted.has(key) ? (
                <Link href={`/sites/${siteId}/content?tab=google`} className="text-sm text-green-700">Drafted ✓ View</Link>
              ) : (
                <form action={draftEventPost.bind(null, siteId, e)}>
                  <SubmitButton className="btn-secondary text-xs" pending="Writing…">Draft Google post</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function Ideas({ siteId }: { siteId: string }) {
  const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const [queries, mapsRow, questions, checks, suggested, articles] = await Promise.all([
    db.query.gscQueryMetrics.findMany({ where: and(eq(schema.gscQueryMetrics.siteId, siteId), gte(schema.gscQueryMetrics.periodEnd, since)), orderBy: desc(schema.gscQueryMetrics.impressions), limit: 200 }),
    db.query.siteInsights.findFirst({ where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, "maps-keywords")), orderBy: desc(schema.siteInsights.createdAt) }),
    db.query.aiQuestions.findMany({ where: and(eq(schema.aiQuestions.siteId, siteId), eq(schema.aiQuestions.hidden, false)) }),
    db.query.aiChecks.findMany({ where: eq(schema.aiChecks.siteId, siteId), orderBy: desc(schema.aiChecks.checkedAt), limit: 500, columns: { questionId: true, mentioned: true } }),
    db.query.keywords.findMany({ where: and(eq(schema.keywords.siteId, siteId), inArray(schema.keywords.status, ["SUGGESTED"])), orderBy: desc(schema.keywords.searchVolume), limit: 15 }),
    db.query.articles.findMany({ where: eq(schema.articles.siteId, siteId), columns: { title: true }, with: { keyword: { columns: { phrase: true } } } }),
  ]);
  const covered = articles.map((a) => `${a.title} ${a.keyword?.phrase ?? ""}`.toLowerCase());
  const isCovered = (phrase: string) => {
    const words = phrase.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    return words.length > 0 && covered.some((c) => words.every((w) => c.includes(w)));
  };
  type Idea = { topic: string; source: string; detail: string };
  const ideas: Idea[] = [];
  const seen = new Set<string>();
  const add = (i: Idea) => {
    const k = i.topic.toLowerCase();
    if (seen.has(k) || isCovered(i.topic)) return;
    seen.add(k);
    ideas.push(i);
  };
  // Searches you already appear for, but low on page 1-3: an article can move them up.
  const byQuery = new Map<string, { impressions: number; position: number }>();
  for (const q of queries) {
    const cur = byQuery.get(q.query);
    if (!cur || q.impressions > cur.impressions) byQuery.set(q.query, { impressions: q.impressions, position: q.position });
  }
  for (const [q, m] of byQuery) if (m.position >= 8 && m.position <= 40 && m.impressions >= 10) add({ topic: q, source: "Google Search", detail: `${m.impressions} impressions, position ${m.position.toFixed(0)}` });
  for (const k of ((mapsRow?.data as { keywords?: SearchKeyword[] } | null)?.keywords ?? []).slice(0, 10)) add({ topic: k.keyword, source: "Google Maps searches", detail: k.count != null ? `${k.count} searches` : `under ${k.below} searches` });
  const mentioned = new Set(checks.filter((c) => c.mentioned).map((c) => c.questionId));
  for (const q of questions) if (!mentioned.has(q.id)) add({ topic: q.question, source: "AI answers", detail: "AI assistants don't mention you for this yet" });
  for (const k of suggested) add({ topic: k.phrase, source: "Keyword research", detail: k.searchVolume ? `${k.searchVolume.toLocaleString()} searches/month` : k.cluster ?? "" });

  if (!ideas.length) return <div className="card text-sm text-slate-500">No new ideas right now. Connect Search Console and run an AI visibility check to get more.</div>;
  return (
    <div className="card p-0">
      <ul className="divide-y">
        {ideas.slice(0, 40).map((i) => (
          <li key={i.topic} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{i.topic}</div>
              <div className="text-xs text-slate-500"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{i.source}</span> {i.detail}</div>
            </div>
            <form action={async (fd: FormData) => { "use server"; await createArticleFromTopic(siteId, {}, fd); }}>
              <input type="hidden" name="topic" value={i.topic} />
              <SubmitButton className="btn-secondary text-xs" pending="Starting…">Write article</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
