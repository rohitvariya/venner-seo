import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { requireSitePageForAgency } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { saveGbpDescription, suggestGbpDescription, syncMapsNow } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { DescriptionEditor } from "@/components/maps/description-editor";
import type { GbpProfile } from "@/lib/gbp";

const DAYS: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);

export default async function ProfilePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const { site } = await requireSitePageForAgency(siteId);
  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [gbp, row, reviews, posts] = await Promise.all([
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.type, "GBP")) }),
    db.query.siteInsights.findFirst({
      where: and(eq(schema.siteInsights.siteId, siteId), eq(schema.siteInsights.kind, "profile")),
      orderBy: desc(schema.siteInsights.createdAt),
    }),
    db.query.reviews.findMany({ where: eq(schema.reviews.siteId, siteId), columns: { rating: true, replyText: true, reviewedAt: true } }),
    db.query.socialPosts.findMany({
      where: and(eq(schema.socialPosts.siteId, siteId), eq(schema.socialPosts.channel, "google"), eq(schema.socialPosts.status, "PUBLISHED"), gte(schema.socialPosts.publishedAt, monthAgo)),
      columns: { publishedAt: true },
    }),
  ]);
  const p = row?.data as GbpProfile | undefined;

  if (!gbp) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Google profile</h1>
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Connect Google Business Profile</p>
            <p className="text-sm text-slate-500">We&apos;ll check your profile is complete, write a better description and keep it active with posts and review replies.</p>
          </div>
          <Link href={`/sites/${siteId}/integrations`} className="btn-primary">Connect</Link>
        </div>
      </div>
    );
  }

  const replied = reviews.filter((r) => r.replyText).length;
  const recentReviews = reviews.filter((r) => r.reviewedAt && r.reviewedAt >= monthAgo).length;
  const postedThisWeek = posts.some((x) => x.publishedAt && x.publishedAt >= weekAgo);
  const checks = p
    ? [
        { ok: (p.description?.length ?? 0) >= 250, label: "Description of 250+ characters", hint: "Use most of the 750 characters: services, who you help, the area you serve." },
        { ok: Boolean(p.primaryCategory), label: "Main category set", hint: "Your main category is the biggest factor in which searches you show for." },
        { ok: p.additionalCategories.length >= 2, label: "2 or more extra categories", hint: "Add every category that truly fits (in Google Business Profile → Edit profile → Business category)." },
        { ok: Boolean(p.phone), label: "Phone number", hint: "Calls are the most valuable action on your profile." },
        { ok: Boolean(p.website), label: "Website link", hint: "Link to your homepage so profile visitors reach your site." },
        { ok: p.hours.length > 0, label: "Opening hours", hint: "Profiles without hours look closed and rank lower." },
        { ok: (p.photoCount ?? 0) >= 10, label: "10+ photos", hint: "Upload photos of your work, team and office; profiles with photos get far more clicks." },
        { ok: reviews.length >= 10, label: "10+ reviews", hint: "Ask every happy client for a review; share your review link after each project." },
        { ok: reviews.length > 0 && replied / reviews.length >= 0.9, label: "Replies to 90%+ of reviews", hint: "Reply to every review; we draft them for you under Reviews." },
        { ok: postedThisWeek, label: "Posted in the last 7 days", hint: "Weekly posts keep your profile active. Turn on Google posts in Content." },
        { ok: digits(p.phone) === "" || digits(site.phone) === "" || digits(p.phone) === digits(site.phone), label: "Phone matches your website", hint: `Google shows ${p.phone}; your settings say ${site.phone}. Use the same number everywhere.` },
      ]
    : [];
  const score = checks.length ? Math.round((checks.filter((c) => c.ok).length / checks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Google profile</h1>
          <p className="text-sm text-slate-500">A complete, active profile ranks higher on Google Maps and gets more calls.</p>
        </div>
        <form action={syncMapsNow.bind(null, siteId)}><SubmitButton className="btn-secondary" pending="Queued">Refresh from Google</SubmitButton></form>
      </div>

      {!p ? (
        <div className="card text-sm text-slate-500">Loading your profile from Google. Refresh this page in a minute.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{p.title}</h2>
                  <p className="text-sm text-slate-500">{[p.primaryCategory, ...p.additionalCategories].filter(Boolean).join(" · ") || "No category"}</p>
                </div>
                {p.mapsUri && <a href={p.mapsUri} target="_blank" rel="noreferrer" className="btn-secondary text-sm"><ExternalLink size={14} />View on Maps</a>}
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-400">Address</dt><dd>{p.address ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-400">Phone</dt><dd>{p.phone ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-400">Website</dt><dd className="truncate">{p.website ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-400">Photos</dt><dd>{p.photoCount ?? "—"}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-400">Hours</dt>
                  <dd className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {p.hours.length ? p.hours.map((h, i) => <span key={i}>{DAYS[h.day] ?? h.day} {h.open}-{h.close}</span>) : "Not set"}
                  </dd>
                </div>
              </dl>
              {p.reviewUri && (
                <div className="rounded-lg bg-brand-50 p-3 text-sm">
                  <span className="font-medium">Your review link: </span>
                  <a href={p.reviewUri} target="_blank" rel="noreferrer" className="break-all text-brand-600">{p.reviewUri}</a>
                  <p className="mt-1 text-xs text-slate-500">Send this to happy clients after each project. More recent reviews = higher on Maps.</p>
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <div>
                <h2 className="font-semibold">Business description</h2>
                <p className="text-sm text-slate-500">Shown on your profile. Say what you do, for whom and where; Google allows 750 characters.</p>
              </div>
              <DescriptionEditor current={p.description ?? ""} suggest={suggestGbpDescription.bind(null, siteId)} save={saveGbpDescription.bind(null, siteId)} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <div className="text-xs text-slate-500">Profile strength</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold">{score}%</span><span className="text-xs text-slate-500">{checks.filter((c) => c.ok).length} of {checks.length} done</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${score}%` }} /></div>
              <ul className="mt-4 space-y-2.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex gap-2 text-sm">
                    {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" /> : <Circle size={16} className="mt-0.5 shrink-0 text-slate-300" />}
                    <div>
                      <div className={c.ok ? "text-slate-500" : "font-medium"}>{c.label}</div>
                      {!c.ok && <div className="text-xs text-slate-500">{c.hint}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card text-sm">
              <div className="text-xs text-slate-500">Last 30 days</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div><div className="text-xl font-semibold">{recentReviews}</div><div className="text-xs text-slate-500">new reviews</div></div>
                <div><div className="text-xl font-semibold">{posts.length}</div><div className="text-xs text-slate-500">Google posts</div></div>
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <Link href={`/sites/${siteId}/reviews`} className="text-brand-600">Reviews →</Link>
                <Link href={`/sites/${siteId}/content?tab=google`} className="text-brand-600">Google posts →</Link>
                <Link href={`/sites/${siteId}/results/maps`} className="text-brand-600">Maps insights →</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
