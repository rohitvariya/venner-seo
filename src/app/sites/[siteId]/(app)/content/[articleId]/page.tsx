import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { approveArticle, clearClientNote, deleteArticle, regenerateArticle, requestArticleChanges, unscheduleArticle } from "@/app/actions";
import { marked } from "marked";
import { addHeadingIds } from "@/lib/headings";
import { RequestChanges } from "@/components/client/request-changes";
import { ArticleEditor } from "@/components/article-editor";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import type { SeoCheck } from "@/lib/seo/score";
import type { Brief } from "@/lib/seo/writer";
import { FactIssues, GooglePreview, Pipeline, SearchDetails } from "@/components/article-panels";

export default async function ArticlePage({ params }: { params: Promise<{ siteId: string; articleId: string }> }) {
  const { siteId, articleId } = await params;
  const { site, isClient } = await requireSite(siteId);
  const article = await db.query.articles.findFirst({
    where: and(eq(schema.articles.id, articleId), eq(schema.articles.siteId, siteId)),
    with: { keyword: true },
  });
  if (!article) notFound();
  const publisher = await db.query.integrations.findFirst({
    where: and(eq(schema.integrations.siteId, siteId), inArray(schema.integrations.type, ["WORDPRESS", "SHOPIFY", "CUSTOM"])),
  });
  const busy = ["IDEA", "WRITING", "PUBLISHING"].includes(article.status);
  const checks: SeoCheck[] = article.seoChecks ?? [];
  const words = (article.contentMd ?? "").split(/\s+/).filter(Boolean).length;
  const canPublish = !!article.contentMd && ["REVIEW", "APPROVED", "FAILED", "PUBLISHED"].includes(article.status);

  if (isClient) {
    const html = article.contentMd ? addHeadingIds(marked.parse(article.contentMd, { async: false }) as string) : "";
    const waiting = article.status === "REVIEW" && !!article.contentMd;
    return (
      <div className="space-y-6">
        <Link href={`/sites/${siteId}`} className="text-sm text-brand-500">← Home</Link>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <article className="card">
            {article.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={article.heroImageUrl} alt="" className="mb-5 aspect-[2/1] w-full rounded-xl object-cover" />
            )}
            <h1 className="mb-4 text-3xl font-semibold leading-tight">{article.title}</h1>
            {html ? <div className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-slate-500">Being written…</p>}
          </article>
          <aside className="space-y-4">
            <div className="card space-y-3">
              <StatusBadge status={article.status} />
              {article.publishedUrl && article.status === "PUBLISHED" && (
                <a href={article.publishedUrl} target="_blank" rel="noreferrer" className="block text-sm text-brand-600">View it on your website ↗</a>
              )}
              {waiting ? (
                <>
                  <p className="text-sm text-slate-600">Happy with this article? Approve it and it goes live on your website.</p>
                  <form action={approveArticle.bind(null, siteId, articleId)}>
                    <input type="hidden" name="when" value="now" />
                    <SubmitButton className="btn-primary w-full" pending="Approving…">Approve &amp; publish</SubmitButton>
                  </form>
                  <div className="border-t pt-3">
                    <p className="mb-2 text-sm font-medium">Something to change?</p>
                    {article.clientNote && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">You asked: {article.clientNote}</p>}
                    <RequestChanges action={requestArticleChanges.bind(null, siteId, articleId)} />
                  </div>
                </>
              ) : article.status === "SCHEDULED" ? (
                <p className="text-sm text-slate-600">Approved. Goes live {article.scheduledAt?.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.</p>
              ) : null}
            </div>
            <GooglePreview domain={site.domain} slug={article.slug} metaTitle={article.metaTitle}
              metaDescription={article.metaDescription} siteName={site.businessName ?? site.domain} />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/sites/${siteId}/content`} className="text-sm text-brand-500">← Content</Link>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={article.status} />
            <ScoreBadge score={article.seoScore} />
            {article.keyword && <span className="text-sm text-slate-500">Keyword: {article.keyword.phrase}</span>}
          </div>
          {article.publishedUrl && (
            <a href={article.publishedUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-brand-500">
              {article.status === "PUBLISHED" ? "View live post ↗" : "View draft on your site ↗"}
            </a>
          )}
          {article.error && <p className="mt-2 text-sm text-red-600">{article.error}</p>}
        </div>
        <div className="flex gap-2">
          <form action={regenerateArticle.bind(null, siteId, articleId)}>
            <SubmitButton className="btn-secondary" pending="Queued">Rewrite with AI</SubmitButton>
          </form>
          <form action={deleteArticle.bind(null, siteId, articleId)}>
            <SubmitButton className="btn-danger" pending="Deleting…">Delete</SubmitButton>
          </form>
        </div>
      </div>

      {article.clientNote && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <div><div className="font-semibold text-amber-900">Your client asked for changes</div><p className="mt-1 whitespace-pre-line text-amber-900">{article.clientNote}</p></div>
          <form action={clearClientNote.bind(null, siteId, articleId)}><SubmitButton className="btn-secondary text-xs" pending="…">Mark as done</SubmitButton></form>
        </div>
      )}

      {busy && !article.contentMd ? (
        <div className="card text-center text-slate-500">
          {article.status === "PUBLISHING" ? "Publishing…" : "Writing this article. This takes about a minute."}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <ArticleEditor siteId={siteId} article={article} />
          <aside className="space-y-4">
            <div className="card space-y-3">
              <h2 className="font-semibold">Approve & publish</h2>
              {!publisher && (
                <p className="text-sm text-amber-700">
                  Connect <Link className="underline" href={`/sites/${siteId}/integrations`}>WordPress, Shopify or your custom site</Link> to publish.
                </p>
              )}
              {article.status === "SCHEDULED" ? (
                <>
                  <p className="text-sm">Scheduled for {article.scheduledAt?.toLocaleString("en-GB")}</p>
                  <form action={unscheduleArticle.bind(null, siteId, articleId)}>
                    <SubmitButton className="btn-secondary w-full">Unschedule</SubmitButton>
                  </form>
                </>
              ) : (
                <form action={approveArticle.bind(null, siteId, articleId)} className="space-y-3">
                  {article.status !== "PUBLISHED" && (
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" value="draft" defaultChecked={article.status !== "APPROVED"} /> Send as draft (not live)</label>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="when" value="now" defaultChecked={article.status === "APPROVED" || article.status === "PUBLISHED"} />
                    {article.status === "PUBLISHED" ? "Update the live post now" : "Publish now"}
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="when" value="schedule" /> Schedule</label>
                  <input type="datetime-local" name="scheduledAt" className="input" />
                  <SubmitButton className="btn-primary w-full" pending="Queuing…">
                    {article.status === "PUBLISHED" ? "Update live post" : "Approve"}
                  </SubmitButton>
                  {!canPublish && <p className="text-xs text-slate-400">Available once the draft is ready.</p>}
                </form>
              )}
            </div>
            <FactIssues issues={article.factIssues} />
            <Pipeline status={article.status} />
            <GooglePreview domain={site.domain} slug={article.slug} metaTitle={article.metaTitle}
              metaDescription={article.metaDescription} siteName={site.businessName ?? site.domain} />
            <SearchDetails keyword={article.keyword?.phrase ?? null} searchVolume={article.keyword?.searchVolume ?? null}
              brief={article.brief as Brief | null} words={words} />
            <div className="card">
              <h2 className="mb-2 font-semibold">SEO checklist</h2>
              <ul className="space-y-1.5 text-sm">
                {checks.map((c) => (
                  <li key={c.id} className={c.passed ? "text-slate-600" : "text-red-600"}>
                    {c.passed ? "✓" : "✕"} {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
