import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { CalendarDays, CheckCircle2, FileText, Globe, Megaphone, Plug, Search as SearchIcon, Star } from "lucide-react";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { computeTodos, connectionsFor, TODO_LABEL, type TodoType } from "@/lib/todos";

const TYPE_STYLE: Record<TodoType, string> = {
  urgent: "bg-red-50 text-red-700",
  fix: "bg-rose-50 text-rose-600",
  ok: "bg-amber-50 text-amber-700",
  idea: "bg-sky-50 text-sky-700",
};

// Local calendar day (not UTC), so items land on the same day the calendar shows.
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function HomePage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string; type?: string }>;
}) {
  const { siteId } = await params;
  const { tab = "overview", type } = await searchParams;
  const { site, user } = await requireSite(siteId);
  const base = `/sites/${siteId}`;
  const [todos, conn] = await Promise.all([computeTodos(site), connectionsFor(siteId)]);

  // Next 7 days of content (articles + posts) for "Going out today".
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86400_000);
  const A = schema.articles;
  const P = schema.socialPosts;
  const [arts, posts, [gsc]] = await Promise.all([
    db.query.articles.findMany({
      where: and(
        eq(A.siteId, siteId),
        inArray(A.status, ["IDEA", "WRITING", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED"]),
        or(and(gte(A.scheduledAt, start), lt(A.scheduledAt, end)), and(gte(A.plannedFor, start), lt(A.plannedFor, end))),
      ),
      columns: { id: true, title: true, status: true, plannedFor: true, scheduledAt: true },
    }),
    db.query.socialPosts.findMany({
      where: and(eq(P.siteId, siteId), gte(P.scheduledAt, start), lt(P.scheduledAt, end)),
      columns: { id: true, channel: true, text: true, status: true, scheduledAt: true },
      orderBy: asc(P.scheduledAt),
    }),
    db.select({ clicks: sql<number>`coalesce(sum(${schema.gscDailyMetrics.clicks}),0)::int` }).from(schema.gscDailyMetrics)
      .where(and(eq(schema.gscDailyMetrics.siteId, siteId), gte(schema.gscDailyMetrics.date, new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10)))),
  ]);
  type Item = { key: string; kind: "Article" | "Post"; label: string; sub: string; href: string; when: Date };
  const items: Item[] = [
    ...arts.map((a) => ({
      key: a.id, kind: "Article" as const, label: a.title, sub: a.status === "PUBLISHED" ? "Live" : a.status === "SCHEDULED" ? "Scheduled" : "Planned",
      href: `${base}/content/${a.id}`, when: (a.scheduledAt ?? a.plannedFor)!,
    })),
    ...posts.map((p) => ({
      key: p.id, kind: "Post" as const, label: p.text.slice(0, 80), sub: p.channel === "google" ? "Google post" : `${p.channel[0].toUpperCase()}${p.channel.slice(1)} post`,
      href: `${base}/content?tab=${p.channel === "google" ? "google" : "social"}`, when: p.scheduledAt!,
    })),
  ];
  const byDay = new Map<string, Item[]>();
  for (const i of items) byDay.set(dayKey(i.when), [...(byDay.get(dayKey(i.when)) ?? []), i]);
  const days = Array.from({ length: 7 }, (_, n) => new Date(start.getTime() + n * 86400_000));
  const today = byDay.get(dayKey(start)) ?? [];

  const cards = [
    { key: "website", done: conn.website, icon: Globe, title: "Your website", text: "So approved articles go live automatically.", href: `${base}/integrations` },
    { key: "gbp", done: conn.gbp, icon: Star, title: "Google Business Profile", text: "So Google posts go out and you can reply to reviews.", href: `${base}/integrations` },
    { key: "gsc", done: conn.gsc, icon: SearchIcon, title: "Google Search Console", text: "So we can see which searches bring people to you.", href: `${base}/integrations` },
    { key: "social", done: site.socialChannels.some((c) => c !== "google"), icon: Megaphone, title: "Social media", text: "Choose channels so posts are written for them.", href: `${base}/content?tab=social` },
  ];
  const connected = cards.filter((c) => c.done).length;
  const firstName = (user.name ?? "").split(" ")[0] || "there";
  const filtered = type ? todos.filter((t) => t.type === type) : todos;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Welcome back, {firstName}!</h2>
          <p className="text-sm text-slate-500">
            {conn.gsc ? `${gsc.clicks.toLocaleString()} people found you on Google in the last 4 weeks.` : "Connect Google to see how many people find you."}
          </p>
        </div>
      </div>

      <div className="flex gap-6 border-b border-slate-200 text-sm">
        <Link href={base} className={`-mb-px border-b-2 pb-2 ${tab !== "todo" ? "border-slate-900 font-medium" : "border-transparent text-slate-500"}`}>Overview</Link>
        <Link href={`${base}?tab=todo`} className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2 ${tab === "todo" ? "border-slate-900 font-medium" : "border-transparent text-slate-500"}`}>
          To-do {todos.length > 0 && <span className="rounded-full bg-red-50 px-1.5 text-xs text-red-600">{todos.length}</span>}
        </Link>
      </div>

      {tab === "todo" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {([["", `Everything (${todos.length})`], ["urgent", "Urgent"], ["fix", "Needs fixing"], ["ok", "Needs your OK"], ["idea", "Ideas"]] as const).map(([v, label]) => (
              <Link key={v} href={`${base}?tab=todo${v ? `&type=${v}` : ""}`}
                className={`rounded-full px-3 py-1 ${(type ?? "") === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</Link>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2 font-medium">To do</th><th className="py-2 font-medium">Type</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><div className="font-medium">{t.title}</div><div className="text-xs text-slate-500">{t.detail}</div></td>
                    <td className="py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[t.type]}`}>{TODO_LABEL[t.type]}</span></td>
                    <td className="px-4 py-3 text-right"><Link href={t.action.href} className="btn-primary px-3 py-1.5 text-xs">{t.action.label}</Link></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Nothing here. You&apos;re all caught up.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          {connected < cards.length && (
            <section className="card">
              <h3 className="font-semibold">Connect your accounts</h3>
              <p className="text-sm text-slate-500">{connected} of {cards.length} connected. Connect the rest so everything goes out and your results come in.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div key={c.key} className={`flex flex-col rounded-xl border p-4 ${c.done ? "border-emerald-200 bg-emerald-50/40" : "border-brand-100 bg-brand-50/50"}`}>
                      <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm"><Icon size={16} /></span>
                      <div className="font-medium">{c.title}</div>
                      <p className="mt-1 flex-1 text-sm text-slate-500">{c.text}</p>
                      {c.done ? (
                        <span className="mt-3 flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 size={15} /> Connected</span>
                      ) : (
                        <Link href={c.href} className="btn-primary mt-3 w-fit px-3 py-1.5 text-xs"><Plug size={13} /> Connect</Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Needs your attention</h3>
                <p className="text-sm text-slate-500">Most important first. Everything else is handled for you.</p>
              </div>
              {todos.length > 3 && <Link href={`${base}?tab=todo`} className="text-sm font-medium">See all {todos.length}</Link>}
            </div>
            <div className="mt-3 space-y-2">
              {todos.slice(0, 3).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="truncate text-xs text-slate-500">{t.detail}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.type === "urgent" && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE.urgent}`}>Urgent</span>}
                    <Link href={t.action.href} className="btn-primary px-3 py-1.5 text-xs">{t.action.label}</Link>
                  </div>
                </div>
              ))}
              {todos.length === 0 && <p className="py-4 text-center text-sm text-slate-400">You&apos;re all caught up.</p>}
            </div>
          </section>

          <section className="card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Going out today</h3>
                <p className="text-sm text-slate-500">{start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
              </div>
              <Link href={`${base}/content`} className="btn-secondary px-3 py-1.5 text-xs"><CalendarDays size={14} /> Calendar</Link>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 p-4">
              {today.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Nothing goes out today.</p>
              ) : (
                <ul className="space-y-2">
                  {today.map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{i.kind === "Article" ? <FileText size={15} /> : <Megaphone size={15} />}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{i.label}</span>
                        <span className="text-xs text-slate-500">{i.sub} · {i.when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-2">
              {days.map((d, n) => {
                const list = byDay.get(dayKey(d)) ?? [];
                return (
                  <Link key={n} href={`${base}/content?tab=calendar&view=week`}
                    className={`rounded-xl border p-2 text-center text-sm ${n === 0 ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50"}`}>
                    <div className={n === 0 ? "font-semibold" : "text-slate-500"}>
                      {n === 0 ? "Today" : <>{d.toLocaleDateString("en-GB", { weekday: "short" })} <span className="font-semibold text-slate-800">{d.getDate()}</span></>}
                    </div>
                    <div className="mt-1 flex justify-center gap-1">
                      {list.length === 0 ? <span className="text-xs text-slate-300">—</span> : (
                        <>
                          {list.some((i) => i.kind === "Article") && <span className="rounded bg-brand-100 px-1.5 text-[11px] text-brand-700">{list.filter((i) => i.kind === "Article").length} article</span>}
                          {list.some((i) => i.kind === "Post") && <span className="rounded bg-emerald-100 px-1.5 text-[11px] text-emerald-700">{list.filter((i) => i.kind === "Post").length} post</span>}
                        </>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
