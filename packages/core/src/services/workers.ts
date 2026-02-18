import { Worker } from "bullmq";

import { getEmbeddingAdapter, getStorageAdapter, getVectorStoreAdapter, getLlmAdapter } from "../factory";
import { logger } from "../logger";
import { QUEUE_NAMES, getRedisConnection } from "../queues/queues";
import type { IngestionJobPayload, ReflectionJobPayload, SyncConnectionJobPayload } from "../types/queue";
import { GitHubConnector } from "../connectors/github";
import { YouTubeConnector } from "../connectors/youtube";
import { XConnectorSkeleton } from "../connectors/x";
import { IngestionService } from "./ingestion";
import { runMemoryReflection } from "./memory";
import { getUserById, updateConnectionSyncState } from "./repositories";

const connectors = {
  github: new GitHubConnector(),
  youtube: new YouTubeConnector(),
  x: new XConnectorSkeleton(),
};

export function startWorkers(): Worker[] {
  const ingestionService = new IngestionService(
    getEmbeddingAdapter(),
    getVectorStoreAdapter(),
    getStorageAdapter(),
  );

  const ingestionWorker = new Worker<IngestionJobPayload>(
    QUEUE_NAMES.INGESTION,
    async (job) => {
      if (job.data.kind === "file") {
        await ingestionService.ingestFile(job.data);
      } else if (job.data.kind === "connector") {
        const connector = connectors[job.data.provider];
        await ingestionService.syncConnection({
          userId: job.data.userId,
          connectionId: job.data.connectionId,
          connector,
        });
      }
    },
    { connection: getRedisConnection() },
  );

  const reflectionWorker = new Worker<ReflectionJobPayload>(
    QUEUE_NAMES.REFLECTION,
    async (job) => {
      const user = await getUserById(job.data.userId);
      if (!user) return;
      await runMemoryReflection(
        {
          llm: getLlmAdapter(),
          embeddings: getEmbeddingAdapter(),
          vectorStore: getVectorStoreAdapter(),
        },
        {
          userId: job.data.userId,
          conversationId: job.data.conversationId,
          allowLearningFromConversations: user.allowLearningFromConversations,
        },
      );
    },
    { connection: getRedisConnection() },
  );

  const connectionWorker = new Worker<SyncConnectionJobPayload>(
    QUEUE_NAMES.CONNECTION_SYNC,
    async (job) => {
      const connector = connectors[job.data.provider];
      await updateConnectionSyncState({
        connectionId: job.data.connectionId,
        status: "pending",
      });
      try {
        await ingestionService.syncConnection({
          userId: job.data.userId,
          connectionId: job.data.connectionId,
          connector,
        });
        await updateConnectionSyncState({
          connectionId: job.data.connectionId,
          status: "connected",
        });
      } catch (error) {
        await updateConnectionSyncState({
          connectionId: job.data.connectionId,
          status: "error",
        });
        throw error;
      }
    },
    { connection: getRedisConnection() },
  );

  ingestionWorker.on("completed", (job) =>
    logger.info("ingestion job completed", { jobId: job.id }),
  );
  ingestionWorker.on("failed", (job, error) =>
    logger.error("ingestion job failed", { jobId: job?.id, error: error.message }),
  );
  reflectionWorker.on("failed", (job, error) =>
    logger.error("reflection job failed", { jobId: job?.id, error: error.message }),
  );
  connectionWorker.on("failed", (job, error) =>
    logger.error("connection sync failed", { jobId: job?.id, error: error.message }),
  );

  return [ingestionWorker, reflectionWorker, connectionWorker];
}

