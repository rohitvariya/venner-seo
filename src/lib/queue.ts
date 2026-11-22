import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAME = "venner-seo";

export type JobName =
  | "scan-site"
  | "plan-keywords"
  | "write-article"
  | "publish-article"
  | "sync-gsc"
  | "tick"; // periodic: publishes due scheduled articles, syncs GSC

export type JobData = { siteId?: string; articleId?: string; draft?: boolean };

let connection: IORedis | null = null;
export function redis() {
  if (!connection) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    if (!/^rediss?:\/\//.test(url)) {
      throw new Error(
        "REDIS_URL must start with redis:// or rediss:// (for Upstash, copy the rediss://default:…@….upstash.io:6379 URL, not the REST https:// URL)",
      );
    }
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

let queue: Queue<JobData, unknown, JobName> | null = null;
export function getQueue() {
  if (!queue) queue = new Queue<JobData, unknown, JobName>(QUEUE_NAME, { connection: redis() });
  return queue;
}

export async function enqueue(name: JobName, data: JobData) {
  await getQueue().add(name, data, {
    // A failed site scan is shown to the user with a "Try again" button, so don't retry it silently.
    attempts: name === "scan-site" ? 1 : 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  });
}
