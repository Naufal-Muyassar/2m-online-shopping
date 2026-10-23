import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./shared/logger";
import { startWorker } from "./worker";

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

if (env.RUN_WORKER_IN_PROCESS) {
  const worker = startWorker();
  logger.info("outbox worker, sweeper and reconciliation running in the API process");
  server.on("close", () => worker.stop());
}
