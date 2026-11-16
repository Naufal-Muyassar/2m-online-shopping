import type { Tx } from "../../shared/db";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { stockProvider } from "../catalog/stock";
import * as counters from "./counters";
import * as repo from "./repo";
import { purgeExpired as purgeExpiredCheckoutKeys } from "../orders/idempotency";

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
    // Redis is the admission gate that absorbs a rush; Postgres is the authority. Even if a counter drifted upwards
    // (eviction, a lost decrement, a restore during a flush) this check refuses a reservation Postgres cannot cover.
    const after = await repo.lockAndComputeSellable(tx, o.branchId, items.map((i) => i.productId));
    const overdrawn = after.filter((r) => r.sellable < 0);
    if (overdrawn.length > 0) {
      const byProduct = new Map(o.lines.map((l) => [l.product_id, l]));
      const wantedBy = new Map(items.map((i) => [i.productId, i.qty]));
      const short = overdrawn.map((r) => {
        const line = byProduct.get(r.product_id)!;
        const requested = wantedBy.get(r.product_id)!;
        return { sku: line.sku, name: line.name, requested, available: Math.max(0, r.sellable + requested) };
      });
      logger.warn({ branch_id: o.branchId, products: overdrawn.map((r) => r.product_id) }, "stock counter above Postgres, checkout refused");
      scheduleRefresh(o.branchId, overdrawn.map((r) => r.product_id));
      throw new AppError(409, "OUT_OF_STOCK", "Some products are out of stock", { skus: short.map((s) => s.sku), items: short });
    }
  } catch (err) {
    await counters.restore(items);
    throw err;
  }
  return { orderId: o.orderId, items };
}

// Re-reads drifted counters from Postgres once the refusing transaction has ended (refresh needs the exclusive
// rebuild lock, which that transaction holds in shared mode, so it must not be awaited inside it).
const refreshing = new Set<string>();
function scheduleRefresh(branchId: string, productIds: readonly string[]): void {
  for (const productId of productIds) {
    const key = counters.counterKey(branchId, productId);
    if (refreshing.has(key)) continue;
    refreshing.add(key);
    counters
      .refresh(branchId, productId)
      .catch((err) => logger.error({ err, branch_id: branchId, product_id: productId }, "stock counter refresh failed"))
      .finally(() => refreshing.delete(key));
  }
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

// CANCELLED: everything the order held goes back on sale, paid or not. Idempotent: a redelivered event
// finds nothing left to release.
export async function releaseCancelled(orderId: string): Promise<number> {
  const released = await repo.releaseHeld(pool, orderId);
  await counters.restore(released);
  if (released.length > 0) logger.info({ order_id: orderId, lines: released.length }, "stock of a cancelled order released");
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

// Repairs reservations whose outbox handler never ran. Orders still waiting for payment are left alone: their
// reservation outlives the invoice and only the payment outcome releases or commits it.
export async function sweepExpired(): Promise<number> {
  let total = 0;
  for (const orderId of await repo.listPaidUncommitted(pool, SWEEP_BATCH)) {
    logger.warn({ order_id: orderId }, "paid order still had an active reservation, committing it");
    await commitOrder(orderId);
  }
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
      const purged = await purgeExpiredCheckoutKeys(pool);
      if (purged > 0) logger.info({ purged }, "expired checkout idempotency keys removed");
    } catch (err) {
      logger.error({ err }, "stock reservation sweep failed");
    } finally {
      running = false;
    }
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}
