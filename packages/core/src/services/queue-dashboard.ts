import { Job } from "bullmq";

import { isLiteRuntime } from "../config";
import { QUEUE_NAMES, connectionSyncQueue, ingestionQueue, reflectionQueue } from "../queues/queues";

const queueMap = {
  [QUEUE_NAMES.INGESTION]: ingestionQueue,
  [QUEUE_NAMES.REFLECTION]: reflectionQueue,
  [QUEUE_NAMES.CONNECTION_SYNC]: connectionSyncQueue,
} as const;

export type QueueName = keyof typeof queueMap;

export interface QueueStats {
  queue: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface FailedJobSummary {
  queue: QueueName;
  id: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

function serializeJob(queue: QueueName, job: Job): FailedJobSummary {
  return {
    queue,
    id: String(job.id),
    name: job.name,
    failedReason: job.failedReason ?? null,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    data: job.data,
  };
}

export async function getQueueDashboard(): Promise<{
  stats: QueueStats[];
  failedJobs: FailedJobSummary[];
}> {
  if (isLiteRuntime()) {
    return {
      stats: [
        {
          queue: QUEUE_NAMES.INGESTION,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
        },
        {
          queue: QUEUE_NAMES.REFLECTION,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
        },
        {
          queue: QUEUE_NAMES.CONNECTION_SYNC,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
        },
      ],
      failedJobs: [],
    };
  }

  const stats: QueueStats[] = [];
  const failedJobs: FailedJobSummary[] = [];

  for (const [name, queue] of Object.entries(queueMap) as Array<[QueueName, (typeof queueMap)[QueueName]]>) {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    const paused = await queue.isPaused();
    stats.push({
      queue: name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused,
    });
    const failed = await queue.getJobs(["failed"], 0, 24, true);
    failedJobs.push(...failed.map((job) => serializeJob(name, job)));
  }

  failedJobs.sort((a, b) => b.timestamp - a.timestamp);
  return {
    stats,
    failedJobs,
  };
}

export async function retryFailedJob(input: {
  queue: QueueName;
  jobId: string;
}): Promise<{ retried: boolean }> {
  if (isLiteRuntime()) {
    return { retried: false };
  }
  const queue = queueMap[input.queue];
  const job = await queue.getJob(input.jobId);
  if (!job) {
    return { retried: false };
  }
  await job.retry();
  return { retried: true };
}

export async function retryAllFailedJobs(input: {
  queue: QueueName;
}): Promise<{ count: number }> {
  if (isLiteRuntime()) {
    return { count: 0 };
  }
  const queue = queueMap[input.queue];
  const failed = await queue.getJobs(["failed"], 0, 999, true);
  let count = 0;
  for (const job of failed) {
    await job.retry();
    count += 1;
  }
  return { count };
}

