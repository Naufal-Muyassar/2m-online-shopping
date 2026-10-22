import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./shared/logger";
import { registerHandler, startOutboxLoop } from "./modules/events/service";

registerHandler("STATUS_CHANGED", async (event) => {
  logger.debug({ event_id: event.id, seq: event.seq, payload: event.payload }, "STATUS_CHANGED");
});

export function startWorker(intervalMs = 1000): { stop: () => void } {
  return startOutboxLoop(intervalMs);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const worker = startWorker();
  logger.info("outbox worker started");
  const shutdown = () => {
    worker.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
