import { withTransaction } from "../../shared/db";
import { logger } from "../../shared/logger";
import * as repo from "./repo";

export type OutboxHandler = (event: repo.OutboxEvent) => Promise<void>;

const BATCH_SIZE = 20;
const BACKOFF = { maxAttempts: 8, baseDelaySec: 5, maxDelaySec: 600 };

const handlers = new Map<string, OutboxHandler>();

export function registerHandler(eventType: string, handler: OutboxHandler): void {
  handlers.set(eventType, handler);
}

// Handlers must be idempotent: a crash between handler success and COMMIT re-delivers the event.
export async function processBatch(): Promise<number> {
  return withTransaction(async (tx) => {
    const events = await repo.claimPending(tx, BATCH_SIZE);
    for (const event of events) {
      try {
        const handler = handlers.get(event.event_type);
        if (!handler) throw new Error(`no handler for ${event.event_type}`);
        await handler(event);
        await repo.markProcessed(tx, event.id);
      } catch (err) {
        logger.warn({ err, event_id: event.id, event_type: event.event_type, attempts: event.attempts + 1 }, "outbox handler failed");
        await repo.markFailedAttempt(tx, event.id, BACKOFF);
      }
    }
    return events.length;
  });
}

export function startOutboxLoop(intervalMs: number): { stop: () => void } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    let processed = 0;
    try {
      processed = await processBatch();
    } catch (err) {
      logger.error({ err }, "outbox batch failed");
    }
    if (!stopped) timer = setTimeout(tick, processed === BATCH_SIZE ? 0 : intervalMs);
  };
  timer = setTimeout(tick, 0);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
