import "dotenv/config";

import { logger, startWorkers } from "@avatar/core";

const workers = startWorkers();

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

