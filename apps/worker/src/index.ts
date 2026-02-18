import "dotenv/config";

import { isLiteRuntime, logger, startWorkers } from "@avatar/core";

if (isLiteRuntime()) {
  logger.info("Lite runtime enabled: worker process is not required");
  setInterval(() => {
    // keep process alive for monorepo dev mode without Redis workers
  }, 60_000);
}

const workers = isLiteRuntime() ? [] : startWorkers();

logger.info("Avatar OS workers started", {
  queues: workers.length,
});

const shutdown = async (): Promise<void> => {
  logger.info("Shutting down workers");
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

