import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { Settings2, Trash2 } from "lucide-react";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { deletePhoto, generateSocialPosts, planMore, savePhotoUsage, updatePhoto } from "@/app/actions";
import { Calendar, type CalItem } from "@/components/content/calendar";
import { CreateMenu } from "@/components/content/create-menu";
import { PhotoUpload } from "@/components/content/photo-upload";
import { PostCard } from "@/components/post-card";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import type { ArticleStatus, PostChannel } from "@/lib/schema";

const TABS = [["calendar", "Calendar"], ["articles", "Articles"], ["social", "Social"], ["google", "Google posts"], ["photos", "Photos"]] as const;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type SP = { tab?: string; view?: string; date?: string; type?: string; status?: string; q?: string; platform?: string };

export default async function ContentPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<SP> }) {
  const { siteId } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "calendar";
  const { site, isClient } = await requireSite(siteId);
  const base = `/sites/${siteId}`;
  const A = schema.articles;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const count = sql<number>`count(*)::int`;
  const [[live], [waiting], [busy]] = await Promise.all([
    db.select({ n: count }).from(A).where(and(eq(A.siteId, siteId), eq(A.status, "PUBLISHED"), gte(A.publishedAt, monthStart))),
    db.select({ n: count }).from(A).where(and(eq(A.siteId, siteId), eq(A.status, "REVIEW"))),
    db.select({ n: count }).from(A).where(and(eq(A.siteId, siteId), inArray(A.status, ["IDEA", "WRITING", "PUBLISHING"]))),
  ]);
  const n = site.articlesPerMonth;
  const every = n >= 28 ? "every day" : n >= 14 ? "every other day" : n >= 8 ? "twice a week" : n >= 4 ? "every week" : `${n} a month`;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <AutoRefresh active={busy.n > 0} intervalMs={6000} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Content</h2>
          <p className="text-sm text-slate-500">
            {live.n} {live.n === 1 ? "piece" : "pieces"} went live this month. {waiting.n ? `${waiting.n} waiting for you.` : "Nothing is waiting for you."}
          </p>
          <p className="text-sm text-slate-500">
            New articles {every} · {site.socialChannels.length} channels · {site.language.toUpperCase()}
            {!isClient && <> ·{" "}<Link href={`${base}/settings`} className="font-medium text-brand-600">Change</Link></>}
          </p>
        </div>
        {!isClient && (
          <div className="flex gap-2">
            <Link href={`${base}/settings`} className="btn-secondary"><Settings2 size={15} /> Settings</Link>
            <CreateMenu siteId={siteId} />
          </div>
        )}
      </div>

      <div className="flex gap-5 border-b border-slate-200 text-sm">
        {TABS.filter(([id]) => !isClient || id !== "photos").map(([id, label]) => (
          <Link key={id} href={`?tab=${id}`}
            className={`-mb-px border-b-2 pb-2 ${tab === id ? "border-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </Link>
        ))}
      </div>

      {tab === "calendar" && <CalendarTab siteId={siteId} sp={sp} readOnly={isClient} />}
      {tab === "articles" && <ArticlesTab siteId={siteId} sp={sp} readOnly={isClient} />}
      {(tab === "social" || tab === "google") && <PostsTab siteId={siteId} google={tab === "google"} platform={sp.platform} readOnly={isClient} />}
      {tab === "photos" && !isClient && <PhotosTab siteId={siteId} usage={site.photoUsage} />}
    </div>
  );
}

async function CalendarTab({ siteId, sp, readOnly }: { siteId: string; sp: SP; readOnly: boolean }) {
  const view = sp.view === "week" ? "week" : "month";
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : iso(new Date());
  const filter = sp.type ?? "all";
  const a = new Date(`${anchor}T00:00:00`);
  const from = new Date(a.getFullYear(), a.getMonth() - 1, 20);
  const to = new Date(a.getFullYear(), a.getMonth() + 1, 12);
  const A = schema.articles;
  const P = schema.socialPosts;
  const base = `/sites/${siteId}`;
  const [arts, posts] = await Promise.all([
    filter === "all" || filter === "article"
      ? db.query.articles.findMany({
          where: and(eq(A.siteId, siteId), or(
            and(gte(A.publishedAt, from), lt(A.publishedAt, to)),
            and(gte(A.scheduledAt, from), lt(A.scheduledAt, to)),
            and(gte(A.plannedFor, from), lt(A.plannedFor, to)),
          )),
          with: { keyword: { columns: { searchVolume: true } } },
        })
      : Promise.resolve([]),
    filter !== "article"
      ? db.query.socialPosts.findMany({
          where: and(
            eq(P.siteId, siteId),
            filter === "google" ? eq(P.channel, "google") : filter === "social" ? ne(P.channel, "google") : undefined,
            or(and(gte(P.scheduledAt, from), lt(P.scheduledAt, to)), and(gte(P.publishedAt, from), lt(P.publishedAt, to))),
          ),
        })
      : Promise.resolve([]),
  ]);
  const items: CalItem[] = [
    ...arts.map((x) => ({
      id: x.id, kind: "article" as const, channel: null, title: x.title, status: x.status,
      at: (x.publishedAt ?? x.scheduledAt ?? x.plannedFor ?? x.createdAt).toISOString(),
      searches: x.keyword?.searchVolume ?? null, image: x.heroImageUrl, href: `${base}/content/${x.id}`,
      locked: readOnly || x.status === "PUBLISHED" || x.status === "PUBLISHING",
    })),
    ...posts.map((p) => ({
      id: p.id, kind: "post" as const, channel: p.channel, title: p.text.slice(0, 90), status: p.status,
      at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(), searches: null, image: p.imageUrl,
      href: `${base}/content?tab=${p.channel === "google" ? "google" : "social"}`,
      locked: readOnly || p.status === "PUBLISHED" || p.status === "PUBLISHING",
    })),
  ];
  return <Calendar siteId={siteId} items={items} view={view} anchor={anchor} filter={filter} readOnly={readOnly} />;
}

const STATUS_FILTERS: [string, string, ArticleStatus[] | null][] = [
  ["all", "Everything", null],
  ["review", "Needs your OK", ["REVIEW"]],
  ["planned", "Planned", ["IDEA", "WRITING"]],
  ["scheduled", "Scheduled", ["APPROVED", "SCHEDULED"]],
  ["live", "Live", ["PUBLISHED"]],
  ["failed", "Failed", ["FAILED"]],
];

async function ArticlesTab({ siteId, sp, readOnly }: { siteId: string; sp: SP; readOnly: boolean }) {
  const A = schema.articles;
  const st = STATUS_FILTERS.find(([id]) => id === (sp.status ?? "all")) ?? STATUS_FILTERS[0];
  const list = await db.query.articles.findMany({
    where: and(eq(A.siteId, siteId), st[2] ? inArray(A.status, st[2]) : undefined, sp.q ? ilike(A.title, `%${sp.q}%`) : undefined),
    with: { keyword: { columns: { phrase: true, searchVolume: true } } },
    orderBy: [desc(sql`coalesce(${A.publishedAt}, ${A.scheduledAt}, ${A.plannedFor}, ${A.createdAt})`)],
    limit: 200,
  });
  const base = `/sites/${siteId}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(([id, label]) => (
          <Link key={id} href={`?tab=articles&status=${id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
            className={`rounded-full px-3 py-1 text-sm ${st[0] === id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value="articles" />
          <input type="hidden" name="status" value={st[0]} />
          <input name="q" defaultValue={sp.q} placeholder="Search articles" className="input w-56 py-1.5" />
        </form>
        {!readOnly && <form action={planMore.bind(null, siteId)}><SubmitButton className="btn-secondary py-1.5" pending="Planning…">+ Plan next month</SubmitButton></form>}
      </div>
      <p className="text-sm text-slate-500">{list.length} articles</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((x) => {
          const when = x.publishedAt ?? x.scheduledAt ?? x.plannedFor;
          return (
            <Link key={x.id} href={`${base}/content/${x.id}`}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md">
              {x.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.heroImageUrl} alt="" className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center bg-gradient-to-br from-brand-50 to-fuchsia-50 text-xs text-slate-400">No image yet</div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500"><span>Your website</span><ScoreBadge score={x.seoScore} /></div>
                <div className="line-clamp-2 font-semibold group-hover:text-brand-700">{x.title}</div>
                {x.keyword && (
                  <div className="truncate text-xs text-slate-500">
                    Main search: {x.keyword.phrase}{x.keyword.searchVolume != null ? ` · ${x.keyword.searchVolume}/mo` : ""}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <StatusBadge status={x.status} />
                  {when && <span className="text-slate-500">{when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {list.length === 0 && <p className="card text-sm text-slate-500">No articles here.</p>}
    </div>
  );
}

async function PostsTab({ siteId, google, platform, readOnly }: { siteId: string; google: boolean; platform?: string; readOnly: boolean }) {
  const P = schema.socialPosts;
  const channelFilter = google
    ? eq(P.channel, "google")
    : platform && platform !== "all" ? eq(P.channel, platform as PostChannel) : ne(P.channel, "google");
  const [list, gbp] = await Promise.all([
    db.query.socialPosts.findMany({
      where: and(eq(P.siteId, siteId), channelFilter),
      orderBy: [asc(sql`case when ${P.status} = 'PUBLISHED' then 1 else 0 end`), asc(P.scheduledAt)],
      limit: 120,
    }),
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.type, "GBP")) }),
  ]);
  const googleConnected = !!gbp?.config?.location;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!google && ["all", "facebook", "instagram", "linkedin", "x"].map((p) => (
          <Link key={p} href={`?tab=social&platform=${p}`}
            className={`rounded-full px-3 py-1 text-sm capitalize ${(platform ?? "all") === p ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {p === "all" ? "All platforms" : p === "x" ? "X" : p}
          </Link>
        ))}
        {google && !googleConnected && !readOnly && (
          <span className="text-sm text-amber-700">
            Connect Google Business Profile in <Link href={`/sites/${siteId}/integrations`} className="underline">Connections</Link> to post automatically.
          </span>
        )}
        {!readOnly && (
          <form action={generateSocialPosts.bind(null, siteId)} className="ml-auto">
            <SubmitButton pending="Writing…">Write the next 2 weeks</SubmitButton>
          </form>
        )}
      </div>
      {list.length === 0 ? (
        <p className="card text-sm text-slate-500">{readOnly ? "No posts yet." : "No posts yet. Click “Write the next 2 weeks”, or use Create."}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="text-xs text-slate-500">
                {(p.publishedAt ?? p.scheduledAt)?.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              {readOnly ? (
                <div className="card space-y-2 text-sm">
                  <div className="flex items-center justify-between text-xs"><span className="font-medium capitalize">{p.channel === "x" ? "X" : p.channel}</span><span className="text-slate-500">{p.status === "PUBLISHED" ? "Posted" : p.status === "SCHEDULED" ? "Scheduled" : "Draft"}</span></div>
                  <p className="whitespace-pre-line text-slate-700">{p.text}</p>
                  {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600">View on Google ↗</a>}
                </div>
              ) : (
                <PostCard siteId={siteId} post={p} googleConnected={googleConnected} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function PhotosTab({ siteId, usage }: { siteId: string; usage: string }) {
  const list = await db.query.photos.findMany({
    where: eq(schema.photos.siteId, siteId),
    columns: { id: true, description: true, tags: true, usedCount: true, filename: true },
    orderBy: desc(schema.photos.createdAt),
  });
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Your photos</h3>
            <p className="text-sm text-slate-500">Photos of your work, team or products. Used as featured images in articles and posts before any stock photo.</p>
          </div>
          <form action={savePhotoUsage.bind(null, siteId)} className="flex items-center gap-2 text-sm">
            Use my photos
            <select name="photoUsage" defaultValue={usage} className="input w-auto py-1.5">
              <option value="always">Every time</option>
              <option value="relevant">When relevant</option>
              <option value="never">Never</option>
            </select>
            <button className="btn-secondary py-1.5">Save</button>
          </form>
        </div>
        <PhotoUpload siteId={siteId} />
      </div>
      <p className="text-sm text-slate-500">{list.length} photos</p>
      {list.length === 0 ? (
        <p className="card text-sm text-slate-500">No photos yet. Upload photos of your work, team or office.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${p.id}`} alt={p.description ?? ""} className="h-40 w-full object-cover" />
              <form action={updatePhoto.bind(null, siteId, p.id)} className="space-y-2 p-3">
                <textarea name="description" rows={2} defaultValue={p.description ?? ""} placeholder="Describe this photo" className="input text-xs" />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Used {p.usedCount}×</span>
                  <div className="flex gap-2">
                    <button className="btn-secondary px-2 py-1 text-xs">Save</button>
                    <button formAction={deletePhoto.bind(null, siteId, p.id)} className="text-slate-400 hover:text-red-500" aria-label="Delete photo"><Trash2 size={14} /></button>
                  </div>
                </div>
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 6).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{t}</span>)}
                  </div>
                )}
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
