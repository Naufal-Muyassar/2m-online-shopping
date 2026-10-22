import type { Pool } from "pg";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

export interface StockItem {
  branchId: string;
  productId: string;
  qty: number;
}

export interface SellableRow {
  branch_id: string;
  product_id: string;
  sellable: number;
}

// sellable = snapshot - (ACTIVE + COMMITTED reservations) - buffer. Not clamped: Redis counters must stay
// symmetric with release increments, so callers clamp for display only. No snapshot row means no stock.
// Pass null to cover every branch product.
export async function computeSellable(db: Db, scope: { branchId: string; productIds: readonly string[] } | null): Promise<SellableRow[]> {
  const res = await db.query<SellableRow>(
    `SELECT bp.branch_id, bp.product_id,
            (COALESCE(s.qty, 0) - bp.stock_buffer - COALESCE(r.held, 0))::int AS sellable
     FROM branch_products bp
     LEFT JOIN stock_snapshots s ON s.branch_id = bp.branch_id AND s.product_id = bp.product_id
     LEFT JOIN (
       SELECT branch_id, product_id, sum(qty) AS held
       FROM stock_reservations
       WHERE status IN ('ACTIVE', 'COMMITTED')
       GROUP BY branch_id, product_id
     ) r ON r.branch_id = bp.branch_id AND r.product_id = bp.product_id
     WHERE ($1::uuid IS NULL OR (bp.branch_id = $1 AND bp.product_id = ANY($2::uuid[])))`,
    [scope?.branchId ?? null, scope?.productIds ?? []],
  );
  return res.rows;
}

export async function insertReservations(
  tx: Tx,
  r: { orderId: string; ttlSec: number; items: readonly StockItem[] },
): Promise<void> {
  for (const i of r.items) {
    await tx.query(
      `INSERT INTO stock_reservations (order_id, product_id, branch_id, qty, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
      [r.orderId, i.productId, i.branchId, i.qty, r.ttlSec],
    );
  }
}

export async function attachInvoice(tx: Tx, orderId: string, invoiceId: string): Promise<void> {
  await tx.query(`UPDATE stock_reservations SET invoice_id = $2 WHERE order_id = $1`, [orderId, invoiceId]);
}

export async function hasReservations(db: Db, orderId: string): Promise<boolean> {
  const res = await db.query(`SELECT 1 FROM stock_reservations WHERE order_id = $1 LIMIT 1`, [orderId]);
  return res.rowCount === 1;
}

const toItems = (rows: { branch_id: string; product_id: string; qty: number }[]): StockItem[] =>
  rows.map((r) => ({ branchId: r.branch_id, productId: r.product_id, qty: r.qty }));

// Idempotent: only rows still ACTIVE are touched, and the returned rows are what the caller must give back to Redis.
export async function releaseActive(db: Db, orderId: string): Promise<StockItem[]> {
  const res = await db.query(
    `UPDATE stock_reservations SET status = 'RELEASED', updated_at = now()
     WHERE order_id = $1 AND status = 'ACTIVE'
     RETURNING branch_id, product_id, qty`,
    [orderId],
  );
  return toItems(res.rows);
}

export async function releaseExpired(db: Db, limit: number): Promise<StockItem[]> {
  const res = await db.query(
    `WITH due AS (
       SELECT order_id, product_id FROM stock_reservations
       WHERE status = 'ACTIVE' AND expires_at < now()
       ORDER BY expires_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE stock_reservations r SET status = 'RELEASED', updated_at = now()
     FROM due WHERE r.order_id = due.order_id AND r.product_id = due.product_id AND r.status = 'ACTIVE'
     RETURNING r.branch_id, r.product_id, r.qty`,
    [limit],
  );
  return toItems(res.rows);
}

export interface CommitResult {
  committed: StockItem[];
  releasedBeforePayment: boolean;
}

export async function commitActive(db: Db, orderId: string): Promise<CommitResult> {
  await db.query(
    `UPDATE stock_reservations SET status = 'COMMITTED', updated_at = now() WHERE order_id = $1 AND status = 'ACTIVE'`,
    [orderId],
  );
  const res = await db.query<{ branch_id: string; product_id: string; qty: number; status: string }>(
    `SELECT branch_id, product_id, qty, status FROM stock_reservations WHERE order_id = $1`,
    [orderId],
  );
  return {
    committed: toItems(res.rows.filter((r) => r.status === "COMMITTED")),
    releasedBeforePayment: res.rows.some((r) => r.status === "RELEASED"),
  };
}

// Stand-in for a central-stock refresh; also used by tests and seeds.
export async function upsertSnapshot(db: Db, branchId: string, productId: string, qty: number): Promise<void> {
  await db.query(
    `INSERT INTO stock_snapshots (branch_id, product_id, qty) VALUES ($1, $2, $3)
     ON CONFLICT (branch_id, product_id) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now()`,
    [branchId, productId, qty],
  );
}
