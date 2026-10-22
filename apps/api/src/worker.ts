import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./shared/logger";
import { registerHandler, startOutboxLoop } from "./modules/events/service";
import { startReconcileLoop } from "./modules/payments/service";
import {
  commitOrder,
  rebuildCounters,
  releaseOrder,
  startSweeperLoop,
} from "./modules/inventory/service";

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

// Stock handlers must stay idempotent: the outbox can redeliver.
registerHandler("STATUS_CHANGED", async (event) => {
  logger.debug({ event_id: event.id, seq: event.seq, payload: event.payload }, "STATUS_CHANGED");
  const { to } = event.payload as { to?: string };
  if (to === "CANCELLED" || to === "FAILED") await releaseOrder(event.aggregate_id);
});

registerHandler("PAYMENT_SUCCESS", async (event) => {
  logger.info({ event_id: event.id, aggregate_id: event.aggregate_id }, "PAYMENT_SUCCESS");
  await commitOrder(event.aggregate_id);
});

registerHandler("PAYMENT_EXPIRED", async (event) => {
  logger.info({ event_id: event.id, aggregate_id: event.aggregate_id }, "PAYMENT_EXPIRED");
  await releaseOrder(event.aggregate_id);
});

export function startWorker(intervalMs = 1000): { stop: () => void } {
  // Counters are rebuilt from Postgres on boot; API processes also seed any missing counter lazily.
  rebuildCounters().then(
    (n) => logger.info({ counters: n }, "stock counters rebuilt"),
    (err) => logger.error({ err }, "stock counter rebuild failed"),
  );
  const outbox = startOutboxLoop(intervalMs);
  const reconcile = startReconcileLoop(RECONCILE_INTERVAL_MS);
  const sweeper = startSweeperLoop(SWEEP_INTERVAL_MS);
  return {
    stop: () => {
      outbox.stop();
      reconcile.stop();
      sweeper.stop();
    },
  };
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
