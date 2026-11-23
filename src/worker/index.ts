import { Worker } from "bullmq";
import { QUEUE_NAME, getQueue, redis, type JobData, type JobName } from "../lib/queue";
import { planKeywords, publishArticleJob, scanSite, syncGsc, tick, writeArticleJob } from "../lib/jobs";
import { checkVisibility, findQuestions, scorePosts } from "../lib/visibility/jobs";
import { runAudit } from "../lib/audit";
import { runGeoGrid, syncGbpMetrics } from "../lib/maps/jobs";
import { makeInsight } from "../lib/grow/jobs";
import { draftGooglePostForArticle, generatePosts, publishPost, syncReviews } from "../lib/social/jobs";

// Background worker: run with `npm run worker` alongside the Next.js app.

const worker = new Worker<JobData, unknown, JobName>(
  QUEUE_NAME,
  async (job) => {
    const { siteId, articleId } = job.data;
    switch (job.name) {
      case "scan-site":
        return scanSite(siteId!);
      case "plan-keywords":
        return planKeywords(siteId!);
      case "write-article":
        return writeArticleJob(articleId!);
      case "publish-article":
        await publishArticleJob(articleId!, { draft: job.data.draft });
        if (!job.data.draft) await draftGooglePostForArticle(articleId!).catch((e) => console.error("Google post draft failed:", e));
        return;
      case "sync-gsc":
        return syncGsc(siteId!);
      case "find-questions":
        return findQuestions(siteId!);
      case "check-visibility":
        return checkVisibility(siteId!);
      case "score-posts":
        return scorePosts(siteId!);
      case "sync-reviews":
        return syncReviews(siteId!);
      case "publish-post":
        return publishPost(job.data.postId!);
      case "generate-posts":
        return generatePosts(siteId!);
      case "audit-site":
        return runAudit(job.data.auditId!);
      case "sync-gbp-metrics":
        return syncGbpMetrics(siteId!);
      case "geo-grid":
        return runGeoGrid(job.data.scanId!);
      case "make-insight":
        return makeInsight(job.data.insightId!);
      case "tick":
        return tick();
    }
  },
  { connection: redis(), concurrency: 3 },
);

worker.on("completed", (job) => console.log(`✓ ${job.name} ${job.id}`));
worker.on("failed", (job, err) => console.error(`✗ ${job?.name} ${job?.id}: ${err.message}`));

// Repeatable tick every 5 minutes.
getQueue()
  .upsertJobScheduler("tick", { every: 5 * 60_000 }, { name: "tick", data: {} })
  .then(() => console.log("Venner SEO worker started"))
  .catch((err) => {
    console.error("Could not register the tick scheduler", err);
    process.exit(1);
  });

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await worker.close();
    process.exit(0);
  });
}
