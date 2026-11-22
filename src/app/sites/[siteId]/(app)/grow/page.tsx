import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { addAiQuestion, findAiQuestions, hideAiQuestion, runAiCheck, scoreSitePosts, writeForQuestion } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import { ENGINE_LABEL, enabledEngines } from "@/lib/visibility/engines";
import { quoteScoreForArticle } from "@/lib/visibility/quote-score";
import type { AiEngine, QuoteCheck } from "@/lib/schema";

type Check = typeof schema.aiChecks.$inferSelect;

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : 0;
}

export default async function GrowPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSite(siteId);
  const engines = enabledEngines();
  const [questions, checks, posts, ownArticles] = await Promise.all([
    db.query.aiQuestions.findMany({
      where: and(eq(schema.aiQuestions.siteId, siteId), eq(schema.aiQuestions.hidden, false)),
      orderBy: schema.aiQuestions.topic,
    }),
    db.query.aiChecks.findMany({ where: eq(schema.aiChecks.siteId, siteId), orderBy: desc(schema.aiChecks.checkedAt), limit: 2000 }),
    db.query.postScores.findMany({ where: eq(schema.postScores.siteId, siteId) }),
    db.query.articles.findMany({
      where: and(eq(schema.articles.siteId, siteId), isNotNull(schema.articles.contentMd)),
      columns: { id: true, title: true, contentMd: true, updatedAt: true, status: true },
    }),
  ]);
  const busy = site.aiStatus === "QUEUED" || site.aiStatus === "RUNNING";

  // Latest answer per question + engine.
  const latest = new Map<string, Check>();
  for (const c of checks) {
    const k = `${c.questionId}:${c.engine}`;
    if (!latest.has(k)) latest.set(k, c);
  }
  const forQ = (qid: string) => engines.map((e) => latest.get(`${qid}:${e}`)).filter((c): c is Check => !!c && !c.error);
  const checkedQs = questions.filter((q) => forQ(q.id).length > 0);
  const mentionedQs = checkedQs.filter((q) => forQ(q.id).some((c) => c.mentioned));
  const citedQs = checkedQs.filter((q) => forQ(q.id).some((c) => c.cited));
  const engineRate = (e: AiEngine) => {
    const list = questions.map((q) => latest.get(`${q.id}:${e}`)).filter((c): c is Check => !!c && !c.error);
    return { checked: list.length, mentioned: list.filter((c) => c.mentioned).length };
  };

  // Competitor share of voice across latest answers.
  const compCount = new Map<string, number>();
  for (const q of checkedQs) {
    const names = new Set(forQ(q.id).flatMap((c) => c.competitorsMentioned));
    for (const n of names) compCount.set(n, (compCount.get(n) ?? 0) + 1);
  }
  const topCompetitors = [...compCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const quickWins = checkedQs.filter((q) => {
    const cs = forQ(q.id);
    return !cs.some((c) => c.mentioned) && cs.some((c) => c.competitorsMentioned.length > 0);
  });
  const missing = checkedQs.filter((q) => !forQ(q.id).some((c) => c.mentioned) && !quickWins.includes(q));

  // Articles to improve (lowest scores first).
  const scored: { key: string; title: string; href: string; external: boolean; score: number; checks: QuoteCheck[] }[] = [
    ...ownArticles.map((a) => {
      const r = quoteScoreForArticle(a.contentMd ?? "", site.domain, a.updatedAt);
      return { key: a.id, title: a.title, href: `/sites/${siteId}/content/${a.id}`, external: false, ...r };
    }),
    ...posts.map((p) => ({ key: p.id, title: p.title ?? p.url, href: p.url, external: true, score: p.score, checks: p.checks })),
  ].sort((a, b) => a.score - b.score);

  return (
    <div className="max-w-5xl space-y-6">
      <AutoRefresh active={busy} intervalMs={6000} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Grow</h1>
          <p className="text-sm text-slate-500">
            How AI assistants answer your customers&apos; questions, and what to do so they recommend you. Checked in{" "}
            {engines.map((e) => ENGINE_LABEL[e]).join(", ")}
            {site.aiCheckedAt ? ` · last check ${site.aiCheckedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.
          </p>
        </div>
        {questions.length > 0 && (
          <form action={runAiCheck.bind(null, siteId)}>
            <SubmitButton className="btn-primary" pending="Queued">{busy ? "Checking…" : "Run check now"}</SubmitButton>
          </form>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="card text-center">
          <h2 className="font-semibold">See if AI recommends you</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            We&apos;ll list the questions buyers ask AI about your services, ask them in AI assistants, and show whether you&apos;re mentioned, which competitors are, and what to write to fix it.
          </p>
          <form action={findAiQuestions.bind(null, siteId)} className="mt-4">
            <SubmitButton pending="Starting…">{busy ? "Working…" : "Find questions and check"}</SubmitButton>
          </form>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="AI mentions you" value={`${pct(mentionedQs.length, checkedQs.length)}%`} sub={`${mentionedQs.length} of ${checkedQs.length} questions`} />
            <Stat label="AI cites your site" value={`${pct(citedQs.length, checkedQs.length)}%`} sub={`${citedQs.length} ${citedQs.length === 1 ? "question links" : "questions link"} to ${site.domain}`} />
            {engines.slice(0, 2).map((e) => {
              const r = engineRate(e);
              return <Stat key={e} label={`${ENGINE_LABEL[e]} mentions you`} value={`${pct(r.mentioned, r.checked)}%`} sub={`${r.mentioned} of ${r.checked}`} />;
            })}
          </div>
          {busy && <p className="card text-sm text-slate-600">Asking AI assistants your customers&apos; questions… this takes a few minutes.</p>}

          {topCompetitors.length > 0 && (
            <div className="card">
              <h2 className="mb-2 font-semibold">Who AI recommends instead</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                {topCompetitors.map(([name, n]) => (
                  <span key={name} className="rounded-full bg-slate-100 px-3 py-1">{name} <span className="text-slate-500">· {n} {n === 1 ? "question" : "questions"}</span></span>
                ))}
              </div>
            </div>
          )}

          <section className="card">
            <h2 className="font-semibold">Quick wins</h2>
            <p className="mb-3 text-sm text-slate-500">AI names your competitors for these but not you. One strong article on each is the fastest way in.</p>
            {quickWins.length === 0 ? (
              <p className="text-sm text-slate-400">No quick wins right now{checkedQs.length ? "." : ": run a check first."}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {quickWins.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{q.question}</div>
                      <div className="text-xs text-slate-500">AI names: {[...new Set(forQ(q.id).flatMap((c) => c.competitorsMentioned))].join(", ")}</div>
                    </div>
                    <form action={writeForQuestion.bind(null, siteId, q.id)}>
                      <SubmitButton className="btn-secondary whitespace-nowrap" pending="Planning…">Write an article for this</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-0">
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <h2 className="font-semibold">Questions people ask AI</h2>
                <p className="text-sm text-slate-500">Latest answer from each assistant.</p>
              </div>
              <form action={findAiQuestions.bind(null, siteId)}>
                <SubmitButton className="btn-secondary" pending="Queued">Find more questions</SubmitButton>
              </form>
            </div>
            <table className="w-full text-sm">
              <thead className="border-t border-slate-100 text-left text-xs text-slate-400">
                <tr>
                  <th className="px-5 py-2">Question</th>
                  {engines.map((e) => <th key={e} className="py-2 text-center">{ENGINE_LABEL[e]}</th>)}
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-2">
                      <details>
                        <summary className="cursor-pointer">{q.question}</summary>
                        <div className="mt-2 space-y-2">
                          {forQ(q.id).map((c) => (
                            <div key={c.id} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                              <div className="mb-1 font-medium text-slate-800">{ENGINE_LABEL[c.engine]}</div>
                              <p className="line-clamp-6 whitespace-pre-line">{c.answerExcerpt}</p>
                              {c.citations.length > 0 && (
                                <p className="mt-1 truncate text-slate-400">Sources: {c.citations.slice(0, 5).map((u) => { try { return new URL(u).hostname; } catch { return u; } }).join(", ")}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                      <div className="text-xs text-slate-400">{q.topic}</div>
                    </td>
                    {engines.map((e) => {
                      const c = latest.get(`${q.id}:${e}`);
                      return (
                        <td key={e} className="py-2 text-center">
                          {!c ? <span className="text-slate-300">—</span>
                            : c.error ? <span title={c.error} className="text-amber-600">!</span>
                            : c.cited ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Cited</span>
                            : c.mentioned ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">Mentioned</span>
                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not mentioned</span>}
                        </td>
                      );
                    })}
                    <td className="px-5 py-2 text-right">
                      <form action={hideAiQuestion.bind(null, siteId, q.id)}><button className="text-xs text-slate-400 hover:text-red-500">Hide</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form action={addAiQuestion.bind(null, siteId)} className="flex gap-2 border-t border-slate-100 px-5 py-3">
              <input name="question" className="input" placeholder="Add a question your customers ask, e.g. best Shopify agency in Surat" />
              <button className="btn-secondary">Add</button>
            </form>
          </section>
          {missing.length > 0 && (
            <p className="text-xs text-slate-500">{missing.length} more questions don&apos;t mention you or tracked competitors. Writing articles that answer them directly helps too.</p>
          )}
        </>
      )}

      <section className="card p-0">
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <h2 className="font-semibold">Articles to improve</h2>
            <p className="text-sm text-slate-500">
              How likely AI is to quote each article, out of 10, from five checks: structured data, FAQ, sources, a clear opening and freshness.
            </p>
          </div>
          <form action={scoreSitePosts.bind(null, siteId)}>
            <SubmitButton className="btn-secondary whitespace-nowrap" pending="Queued">Check my website&apos;s posts</SubmitButton>
          </form>
        </div>
        {scored.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-slate-400">No articles yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {scored.slice(0, 40).map((a) => (
                <tr key={a.key} className="border-t border-slate-100 align-top">
                  <td className="w-16 px-5 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.score >= 8 ? "bg-emerald-50 text-emerald-700" : a.score >= 6 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {a.score}/10
                    </span>
                  </td>
                  <td className="py-2 pr-5">
                    {a.external ? (
                      <a href={a.href} target="_blank" rel="noreferrer" className="font-medium hover:text-brand-500">{a.title} ↗</a>
                    ) : (
                      <Link href={a.href} className="font-medium hover:text-brand-500">{a.title}</Link>
                    )}
                    <div className="text-xs text-slate-400">{a.external ? "On your website" : "Written in Venner SEO"}</div>
                    {a.checks.filter((c) => !c.passed).map((c) => (
                      <div key={c.id} className="text-xs text-slate-600">✕ <span className="font-medium">{c.label}:</span> {c.tip}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
