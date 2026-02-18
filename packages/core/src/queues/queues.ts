import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

import { getConfig } from "../config";
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

export const ingestionQueue = new Queue<IngestionJobPayload>(QUEUE_NAMES.INGESTION, {
  connection,
});

export const reflectionQueue = new Queue<ReflectionJobPayload>(QUEUE_NAMES.REFLECTION, {
  connection,
});

export const connectionSyncQueue = new Queue<SyncConnectionJobPayload>(
  QUEUE_NAMES.CONNECTION_SYNC,
  {
    connection,
  },
);

export function getRedisConnection(): ConnectionOptions {
  return connection;
}
