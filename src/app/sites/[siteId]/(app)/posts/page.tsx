import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { generateSocialPosts, saveSocialSettings } from "@/app/actions";
import { PostCard } from "@/components/post-card";
import { AutoRefresh, SubmitButton } from "@/components/ui";

const CHANNELS = [
  ["google", "Google Business Profile", "Posts automatically"],
  ["facebook", "Facebook", "Copy & post"],
  ["instagram", "Instagram", "Copy & post"],
  ["linkedin", "LinkedIn", "Copy & post"],
  ["x", "X (Twitter)", "Copy & post"],
] as const;

export default async function PostsPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { siteId } = await params;
  const { tab = "upcoming" } = await searchParams;
  const { site } = await requireSite(siteId);
  const P = schema.socialPosts;
  const [posts, gbp] = await Promise.all([
    db.query.socialPosts.findMany({
      where: and(eq(P.siteId, siteId), tab === "posted" ? eq(P.status, "PUBLISHED") : inArray(P.status, ["DRAFT", "SCHEDULED", "PUBLISHING", "FAILED"])),
      orderBy: tab === "posted" ? desc(P.publishedAt) : asc(P.scheduledAt),
      limit: 100,
    }),
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.type, "GBP")) }),
  ]);
  const googleConnected = !!gbp?.config?.location;
  const busy = posts.some((p) => p.status === "PUBLISHING");

  return (
    <div className="max-w-6xl space-y-6">
      <AutoRefresh active={busy} intervalMs={5000} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-sm text-slate-500">
            Google Business Profile updates and social posts, written from your articles and services. Nothing goes out without your OK.
          </p>
        </div>
        <form action={generateSocialPosts.bind(null, siteId)}>
          <SubmitButton pending="Writing…">Write the next 2 weeks</SubmitButton>
        </form>
      </div>

      {!googleConnected && (
        <div className="card flex items-center justify-between gap-4 border-amber-200">
          <p className="text-sm text-slate-600">Connect Google Business Profile to publish Google posts automatically and reply to reviews.</p>
          <Link href={`/sites/${siteId}/integrations`} className="btn-secondary whitespace-nowrap">Connect Google</Link>
        </div>
      )}

      <details className="card">
        <summary className="cursor-pointer font-semibold">Post settings</summary>
        <form action={saveSocialSettings.bind(null, siteId)} className="mt-3 space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map(([id, label, note]) => (
              <label key={id} className="flex items-center gap-2">
                <input type="checkbox" name={`ch_${id}`} defaultChecked={site.socialChannels.includes(id)} />
                {label} <span className="text-xs text-slate-400">· {note}</span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2">
            Google posts per week
            <input type="number" min={0} max={7} name="googlePostsPerWeek" defaultValue={site.googlePostsPerWeek} className="input w-20" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoReplyPositive" defaultChecked={site.autoReplyPositive} />
            Reply to 4 and 5-star reviews automatically (lower ratings always wait for you)
          </label>
          <SubmitButton className="btn-secondary">Save settings</SubmitButton>
        </form>
      </details>

      <div className="flex gap-2">
        {[["upcoming", "Upcoming"], ["posted", "Posted"]].map(([id, label]) => (
          <Link key={id} href={`?tab=${id}`} className={`rounded-full px-3 py-1 text-sm ${tab === id ? "bg-brand-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="card text-sm text-slate-500">
          {tab === "posted" ? "Nothing posted yet." : "No posts planned. Click “Write the next 2 weeks” to get drafts for your channels."}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="text-xs text-slate-500">
                {(p.publishedAt ?? p.scheduledAt)?.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              <PostCard siteId={siteId} post={p} googleConnected={googleConnected} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
