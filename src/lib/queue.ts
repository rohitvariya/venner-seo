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

export type JobData = { siteId?: string; articleId?: string };

let connection: IORedis | null = null;
export function redis() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
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
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  });
}
