import type { Pool } from "pg";
import type { CourierLedgerEntry, CourierLedgerResponse } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { decodeCursor, encodeCursor } from "../orders/customer";

type Db = Pool | Tx;

// Orders without pay (no wage on the order, or a 0 failed fraction) leave no entry.
// The UNIQUE order_id makes a second credit a no-op whatever the caller does.
export async function creditOrder(tx: Tx, orderId: string): Promise<void> {
  await tx.query(
    `INSERT INTO courier_ledger_entries (courier_id, branch_id, type, amount, order_id)
     SELECT assigned_courier_id, branch_id, 'EARNING', courier_pay_final, id
     FROM orders
     WHERE id = $1 AND assigned_courier_id IS NOT NULL AND courier_pay_final > 0
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId],
  );
}

export async function getBalance(db: Db, courierId: string): Promise<number> {
  const res = await db.query<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0)::int AS balance FROM courier_ledger_entries WHERE courier_id = $1`,
    [courierId],
  );
  return res.rows[0]?.balance ?? 0;
}

export async function listEntries(
  db: Db,
  courierId: string,
  opts: { cursor?: string; limit: number },
): Promise<CourierLedgerResponse> {
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const res = await db.query<{
    id: string;
    type: CourierLedgerEntry["type"];
    amount: number;
    order_code: string | null;
    order_status: CourierLedgerEntry["order_status"];
    recorded_by_name: string | null;
    created_at: Date;
    created_cursor: string;
  }>(
    `SELECT l.id, l.type, l.amount, o.code AS order_code, o.status AS order_status, u.name AS recorded_by_name, l.created_at,
            to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor
     FROM courier_ledger_entries l
     LEFT JOIN orders o ON o.id = l.order_id
     LEFT JOIN users u ON u.id = l.recorded_by
     WHERE l.courier_id = $1 AND ($2::timestamptz IS NULL OR (l.created_at, l.id) < ($2::timestamptz, $3::uuid))
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $4`,
    [courierId, after?.[0] ?? null, after?.[1] ?? null, opts.limit + 1],
  );
  const page = res.rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    entries: page.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      order_code: r.order_code,
      order_status: r.order_status,
      recorded_by_name: r.recorded_by_name,
      created_at: r.created_at.toISOString(),
    })),
    next_cursor: res.rows.length > opts.limit && last ? encodeCursor(last.created_cursor, last.id) : null,
  };
}

export interface WithdrawalRow {
  id: string;
  amount: number;
  created_at: Date;
}

export async function findWithdrawal(tx: Tx, courierId: string, idempotencyKey: string): Promise<WithdrawalRow | null> {
  const res = await tx.query<WithdrawalRow>(
    `SELECT id, amount, created_at FROM courier_ledger_entries WHERE courier_id = $1 AND idempotency_key = $2`,
    [courierId, idempotencyKey],
  );
  return res.rows[0] ?? null;
}

export async function insertWithdrawal(
  tx: Tx,
  w: { courierId: string; branchId: string; amount: number; adminId: string; idempotencyKey: string },
): Promise<WithdrawalRow> {
  const res = await tx.query<WithdrawalRow>(
    `INSERT INTO courier_ledger_entries (courier_id, branch_id, type, amount, recorded_by, idempotency_key)
     VALUES ($1, $2, 'WITHDRAWAL', $3, $4, $5)
     RETURNING id, amount, created_at`,
    [w.courierId, w.branchId, -w.amount, w.adminId, w.idempotencyKey],
  );
  return res.rows[0]!;
}
