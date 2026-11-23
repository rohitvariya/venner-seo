import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { requireSite } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { syncReviewsNow, toggleTestimonial } from "@/app/actions";
import { ReviewReply } from "@/components/review-reply";
import { SubmitButton } from "@/components/ui";

const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export default async function ReviewsPage({ params, searchParams }: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { siteId } = await params;
  const { tab = "todo" } = await searchParams;
  const { site } = await requireSite(siteId);
  const R = schema.reviews;
  const [all, gbp] = await Promise.all([
    db.query.reviews.findMany({ where: eq(R.siteId, siteId), orderBy: desc(R.reviewedAt), limit: 300 }),
    db.query.integrations.findFirst({ where: and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.type, "GBP")) }),
  ]);
  const todo = all.filter((r) => !r.replyText);
  const list = tab === "todo" ? todo : all;
  const candidates = all.filter((r) => r.rating >= 4 && r.comment);
  const picked = all.filter((r) => r.isTestimonial);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const embed = site.widgetKey
    ? `<div id="venner-testimonials"></div>\n<script src="${appUrl}/api/public/v1/widget/${site.widgetKey}" async></script>`
    : null;
  const avg = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
  const replied = all.filter((r) => r.replyText).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reviews</h1>
          <p className="text-sm text-slate-500">Google reviews with a reply drafted for each one. Edit and post in one click.</p>
        </div>
        {gbp?.config?.location && (
          <form action={syncReviewsNow.bind(null, siteId)}><SubmitButton className="btn-secondary" pending="Queued">Check for new reviews</SubmitButton></form>
        )}
      </div>

      {!gbp?.config?.location ? (
        <div className="card text-center">
          <h2 className="font-semibold">Reply to reviews in one place</h2>
          <p className="mt-1 text-sm text-slate-500">Connect your Google Business Profile and we&apos;ll draft a reply to every new review for you to send in one click.</p>
          <Link href={`/sites/${siteId}/integrations`} className="btn-primary mt-4">Connect Google Business Profile</Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card"><div className="text-xs text-slate-500">Average rating</div><div className="mt-1 text-2xl font-semibold">{avg ? avg.toFixed(1) : "—"} <span className="text-base text-amber-500">★</span></div><div className="text-xs text-slate-500">{all.length} reviews</div></div>
            <div className="card"><div className="text-xs text-slate-500">Waiting for a reply</div><div className="mt-1 text-2xl font-semibold">{todo.length}</div></div>
            <div className="card"><div className="text-xs text-slate-500">Reply rate</div><div className="mt-1 text-2xl font-semibold">{all.length ? Math.round((replied / all.length) * 100) : 0}%</div></div>
          </div>
          <div className="flex gap-2">
            {[["todo", `Needs reply (${todo.length})`], ["all", "All reviews"], ["testimonials", `Testimonials (${picked.length})`]].map(([id, label]) => (
              <Link key={id} href={`?tab=${id}`} className={`rounded-full px-3 py-1 text-sm ${tab === id ? "bg-brand-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</Link>
            ))}
          </div>
          {tab === "testimonials" ? (
            <div className="space-y-4">
              <div className="card space-y-2">
                <h2 className="font-semibold">Show your best reviews on your website</h2>
                <p className="text-sm text-slate-500">
                  Pick the reviews to feature. Paste the code below once into your website (a Custom HTML block in WordPress, or a section in Shopify); new picks appear automatically.
                </p>
                {embed ? (
                  <>
                    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{embed}</pre>
                    {appUrl.includes("localhost") && (
                      <p className="text-xs text-amber-700">This address only works on your computer. Once Venner SEO is online, the code uses your live address.</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Pick a review below to get your website code.</p>
                )}
              </div>
              {candidates.length === 0 && <p className="card text-sm text-slate-500">No 4 or 5 star reviews with text yet.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {candidates.map((r) => (
                  <div key={r.id} className={`card flex flex-col gap-2 ${r.isTestimonial ? "ring-2 ring-brand-500" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.reviewer ?? "Google user"}</span>
                      <span className="text-amber-500">{stars(r.rating)}</span>
                    </div>
                    <p className="flex-1 text-sm text-slate-700">{r.comment}</p>
                    <form action={toggleTestimonial.bind(null, siteId, r.id)}>
                      <SubmitButton className={r.isTestimonial ? "btn-secondary text-xs" : "btn-primary text-xs"} pending="Saving…">
                        {r.isTestimonial ? "Remove from website" : "Show on website"}
                      </SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : (<>
          {list.length === 0 && <p className="card text-sm text-slate-500">{tab === "todo" ? "All caught up. Every review has a reply." : "No reviews yet."}</p>}
          <div className="space-y-3">
            {list.map((r) => (
              <div key={r.id} className={`card space-y-2 ${r.rating <= 3 && !r.replyText ? "border-amber-300" : ""}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{r.reviewer ?? "Google user"}</span>{" "}
                    <span className="text-amber-500">{stars(r.rating)}</span>
                  </div>
                  <span className="text-xs text-slate-400">{r.reviewedAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
                <p className="text-sm text-slate-700">{r.comment || <span className="italic text-slate-400">Rating only, no text</span>}</p>
                {r.replyText ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="mb-1 text-xs font-medium text-slate-500">Your reply</div>
                    {r.replyText}
                  </div>
                ) : (
                  <>
                    {r.error && <p className="text-xs text-red-600">{r.error}</p>}
                    <ReviewReply siteId={siteId} reviewId={r.id} draft={r.draftReply ?? ""} />
                  </>
                )}
              </div>
            ))}
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
