import type { Tx } from "../../shared/db";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { stockProvider } from "../catalog/stock";
import * as counters from "./counters";
import * as repo from "./repo";

export type { StockItem } from "./repo";

const SWEEP_BATCH = 200;

export interface ReservableLine {
  product_id: string;
  sku: string;
  name: string;
  qty: number;
}

export interface Reservation {
  orderId: string;
  items: repo.StockItem[];
}

// Runs inside Tx1 of order creation, after the order row exists. Redis is decremented first (atomically for all
// lines), then the rows are written in the caller's transaction. Pass the result to cancelReservation if the
// transaction fails afterwards.
export async function reserveForOrder(
  tx: Tx,
  o: { orderId: string; branchId: string; lines: readonly ReservableLine[]; ttlSec: number },
): Promise<Reservation> {
  const wanted = o.lines.map((l) => ({ branchId: o.branchId, productId: l.product_id, qty: l.qty }));
  let items: repo.StockItem[];
  try {
    items = await counters.reserve(tx, wanted);
  } catch (err) {
    if (!(err instanceof counters.InsufficientStockError)) throw err;
    const byProduct = new Map(o.lines.map((l) => [l.product_id, l]));
    const short = err.shortages.map((s) => ({
      sku: byProduct.get(s.productId)!.sku,
      name: byProduct.get(s.productId)!.name,
      requested: s.requested,
      available: s.available,
    }));
    throw new AppError(409, "OUT_OF_STOCK", "Some products are out of stock", { skus: short.map((s) => s.sku), items: short });
  }
  try {
    await repo.insertReservations(tx, { orderId: o.orderId, ttlSec: o.ttlSec, items });
  } catch (err) {
    await counters.restore(items);
    throw err;
  }
  return { orderId: o.orderId, items };
}

// Call when the checkout transaction failed after reserveForOrder succeeded. If the COMMIT actually went through
// (ambiguous failure) the rows exist and the counters must stay decremented.
export async function cancelReservation(r: Reservation): Promise<void> {
  try {
    if (await repo.hasReservations(pool, r.orderId)) return;
  } catch (err) {
    logger.error({ err, order_id: r.orderId }, "could not verify reservation after failed checkout");
    return;
  }
  await counters.restore(r.items);
}

export async function linkInvoice(tx: Tx, orderId: string, invoiceId: string): Promise<void> {
  await repo.attachInvoice(tx, orderId, invoiceId);
}

// Idempotent: Redis is incremented only for rows this call actually moved from ACTIVE to RELEASED.
export async function releaseOrder(orderId: string): Promise<number> {
  const released = await repo.releaseActive(pool, orderId);
  await counters.restore(released);
  if (released.length > 0) logger.info({ order_id: orderId, lines: released.length }, "stock reservation released");
  return released.length;
}

// PAYMENT_SUCCESS: the reserved stock is now sold. The provider call is keyed so redelivery is harmless.
export async function commitOrder(orderId: string): Promise<void> {
  const { committed, releasedBeforePayment } = await repo.commitActive(pool, orderId);
  if (releasedBeforePayment) {
    logger.error({ order_id: orderId }, "payment succeeded after the stock reservation was released, needs manual review");
  }
  if (committed.length === 0) return;
  await stockProvider.commit(
    `order:${orderId}:commit`,
    committed.map((c) => ({ branchId: c.branchId, productId: c.productId, qty: c.qty })),
  );
}

export async function sweepExpired(): Promise<number> {
  let total = 0;
  for (;;) {
    const released = await repo.releaseExpired(pool, SWEEP_BATCH);
    if (released.length === 0) return total;
    await counters.restore(released);
    total += released.length;
    if (released.length < SWEEP_BATCH) return total;
  }
}

export async function setStock(branchId: string, productId: string, qty: number): Promise<void> {
  await repo.upsertSnapshot(pool, branchId, productId, qty);
  await counters.refresh(branchId, productId);
}

export const rebuildCounters = counters.rebuildAll;

export function startSweeperLoop(intervalMs: number): { stop: () => void } {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const released = await sweepExpired();
      if (released > 0) logger.info({ released }, "expired stock reservations released");
    } catch (err) {
      logger.error({ err }, "stock reservation sweep failed");
    } finally {
      running = false;
    }
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}
