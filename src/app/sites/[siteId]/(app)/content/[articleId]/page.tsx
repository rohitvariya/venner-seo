import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSite } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { approveArticle, deleteArticle, regenerateArticle, unscheduleArticle } from "@/app/actions";
import { ArticleEditor } from "@/components/article-editor";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import type { SeoCheck } from "@/lib/seo/score";
import type { Brief } from "@/lib/seo/writer";
import { FactIssues, GooglePreview, Pipeline, SearchDetails } from "@/components/article-panels";

export default async function ArticlePage({ params }: { params: Promise<{ siteId: string; articleId: string }> }) {
  const { siteId, articleId } = await params;
  const { site } = await requireSite(siteId);
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
