import type { Pool } from "pg";
import type { StockStatus } from "@2m/shared";
import { pool, type Tx } from "../../shared/db";
import { logger } from "../../shared/logger";
import { computeSellable } from "../inventory/repo";

export const LOW_STOCK_AT = 5;

export const stockStatusOf = (sellable: number): StockStatus =>
  sellable <= 0 ? "out" : sellable <= LOW_STOCK_AT ? "low" : "available";

export interface StockCommitLine {
  branchId: string;
  productId: string;
  qty: number;
}

export interface StockProvider {
  // Pass the caller's transaction when there is one: a second pool connection would starve the pool under load.
  statusFor(branchId: string, productIds: readonly string[], db?: Pool | Tx): Promise<Map<string, StockStatus>>;
  // Tells the central stock system that reserved units were sold. Must be idempotent per key.
  commit(idempotencyKey: string, lines: readonly StockCommitLine[]): Promise<void>;
}

// Stand-in for the central stock API: reads stock_snapshots minus reservations and buffer; commit only logs.
export class SnapshotStockProvider implements StockProvider {
  async statusFor(branchId: string, productIds: readonly string[], db: Pool | Tx = pool): Promise<Map<string, StockStatus>> {
    const rows = await computeSellable(db, { branchId, productIds });
    return new Map(rows.map((r) => [r.product_id, stockStatusOf(r.sellable)] as const));
  }

  async commit(idempotencyKey: string, lines: readonly StockCommitLine[]): Promise<void> {
    logger.info({ idempotency_key: idempotencyKey, lines }, "stock commit (stub)");
  }
}

export const stockProvider: StockProvider = new SnapshotStockProvider();
