import { Queue } from "bullmq";
import type { Job, JobsOptions } from "bullmq";
import type { ConnectionOptions } from "bullmq";

import { getConfig, isLiteRuntime } from "../config";
import type {
  IngestionJobPayload,
  ReflectionJobPayload,
  SyncConnectionJobPayload,
} from "../types/queue";

const connection: ConnectionOptions = {
  url: getConfig().REDIS_URL,
  maxRetriesPerRequest: null,
};

export const QUEUE_NAMES = {
  INGESTION: "ingestion-jobs",
  REFLECTION: "reflection-jobs",
  CONNECTION_SYNC: "connection-sync-jobs",
} as const;

class NoopQueue<T> {
  constructor(public readonly name: string) {}

  async add(
    jobName: string,
    data: T,
    opts?: JobsOptions,
  ): Promise<Job<T>> {
    return {
      id: `noop-${this.name}-${jobName}-${Date.now()}`,
      name: jobName,
      data,
      opts,
    } as unknown as Job<T>;
  }

  async getJobCounts(
    ..._types: string[]
  ): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }

  async isPaused(): Promise<boolean> {
    return false;
  }

  async getJobs(
    ..._args: [string[], number, number, boolean] | unknown[]
  ): Promise<Job<T>[]> {
    return [];
  }

  async getJob(_jobId: string): Promise<Job<T> | null> {
    return null;
  }
}

function createQueue<T>(name: string): Queue<T> | NoopQueue<T> {
  if (isLiteRuntime()) {
    return new NoopQueue<T>(name);
  }
  return new Queue<T>(name, { connection });
}

export const ingestionQueue = createQueue<IngestionJobPayload>(QUEUE_NAMES.INGESTION);

export const reflectionQueue = createQueue<ReflectionJobPayload>(QUEUE_NAMES.REFLECTION);

export const connectionSyncQueue = createQueue<SyncConnectionJobPayload>(
  QUEUE_NAMES.CONNECTION_SYNC,
);

export function getRedisConnection(): ConnectionOptions {
  return connection;
}
