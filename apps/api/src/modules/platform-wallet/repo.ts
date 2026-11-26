import type { Pool } from "pg";
import type {
  PlatformExpenseCategory,
  PlatformWalletEntry,
  PlatformWalletResponse,
  PlatformWalletType,
} from "@2m/shared";
import { PLATFORM_EXPENSE_CATEGORIES, PLATFORM_WALLET_TYPES } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { decodeCursor, encodeCursor } from "../orders/customer";
import { FAILED_DELIVERY_REFUND_KEY } from "../refunds/service";

type Db = Pool | Tx;

// Called in the transaction that moves an order to DELIVERED or FAILED, after the courier pay and the failed-delivery
// refund are set. One row per (order, type); a replay inserts nothing. Zero amounts leave no row.
//   ONGKIR_IN      + delivery_fee (gross ongkir charged)
//   VOUCHER        − voucher_discount (ongkir voucher, borne by 2M)
//   COURIER_PAY    − courier_pay_final (full wage, or the failed fraction)
//   ONGKIR_REFUND  − the ongkir part of the failed-delivery refund: what the customer paid for ongkir
//                    (delivery_fee − voucher_discount), never more than the refund itself. The goods part of that
//                    refund is the store's, not the wallet's.
export async function settleOrder(tx: Tx, orderId: string): Promise<void> {
  await tx.query(
    `INSERT INTO platform_wallet_entries (branch_id, order_id, type, amount)
     SELECT o.branch_id, o.id, e.type::platform_wallet_type, e.amount
     FROM orders o
     CROSS JOIN LATERAL (VALUES
       ('ONGKIR_IN', o.delivery_fee),
       ('VOUCHER', -o.voucher_discount),
       ('COURIER_PAY', -COALESCE(o.courier_pay_final, 0)),
       ('ONGKIR_REFUND', -COALESCE(
         (SELECT LEAST(r.amount, GREATEST(o.delivery_fee - o.voucher_discount, 0))
          FROM refunds r WHERE r.order_id = o.id AND r.dedupe_key = $2), 0))
     ) AS e(type, amount)
     WHERE o.id = $1 AND o.status IN ('DELIVERED', 'FAILED') AND e.amount <> 0
     ON CONFLICT (order_id, type) DO NOTHING`,
    [orderId, FAILED_DELIVERY_REFUND_KEY],
  );
}

export interface ManualRow {
  id: string;
  type: PlatformWalletType;
  category: PlatformExpenseCategory | null;
  amount: number;
  branch_id: string | null;
  note: string;
  created_at: Date;
}

export async function findManual(tx: Tx, idempotencyKey: string): Promise<ManualRow | null> {
  const res = await tx.query<ManualRow>(
    `SELECT id, type, category, amount, branch_id, note, created_at FROM platform_wallet_entries WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return res.rows[0] ?? null;
}

export async function insertManual(
  tx: Tx,
  e: {
    type: "EXPENSE" | "TOP_UP";
    category: PlatformExpenseCategory | null;
    amount: number;
    branchId: string | null;
    note: string;
    recordedBy: string;
    idempotencyKey: string;
  },
): Promise<ManualRow> {
  const res = await tx.query<ManualRow>(
    `INSERT INTO platform_wallet_entries (branch_id, type, category, amount, note, recorded_by, idempotency_key)
     VALUES ($1, $2::platform_wallet_type, $3::platform_expense_category, $4, $5, $6, $7)
     RETURNING id, type, category, amount, branch_id, note, created_at`,
    [e.branchId, e.type, e.category, e.amount, e.note, e.recordedBy, e.idempotencyKey],
  );
  return res.rows[0]!;
}

export async function branchExists(db: Db, branchId: string): Promise<boolean> {
  const res = await db.query(`SELECT 1 FROM branches WHERE id = $1`, [branchId]);
  return (res.rowCount ?? 0) > 0;
}

export interface WalletFilter {
  branchId: string | null;
  // Inclusive Asia/Jakarta days, YYYY-MM-DD.
  from: string | null;
  to: string | null;
}

// $1 branch, $2 from day, $3 to day. Period bounds are Jakarta calendar days.
const PERIOD = `($2::date IS NULL OR e.created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Jakarta'))
  AND ($3::date IS NULL OR e.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta'))`;
const BRANCH = `($1::uuid IS NULL OR e.branch_id = $1::uuid)`;

export async function summary(db: Db, f: WalletFilter): Promise<Omit<PlatformWalletResponse, "entries" | "next_cursor">> {
  const params = [f.branchId, f.from, f.to];
  const [balance, byType, byCategory, subsidy] = await Promise.all([
    db.query<{ total: number }>(
      `SELECT COALESCE(SUM(e.amount), 0)::int AS total FROM platform_wallet_entries e WHERE ${BRANCH}`,
      [f.branchId],
    ),
    db.query<{ type: PlatformWalletType; total: number }>(
      `SELECT e.type, SUM(e.amount)::int AS total FROM platform_wallet_entries e WHERE ${BRANCH} AND ${PERIOD} GROUP BY e.type`,
      params,
    ),
    db.query<{ category: PlatformExpenseCategory; total: number }>(
      `SELECT e.category, SUM(e.amount)::int AS total FROM platform_wallet_entries e
       WHERE e.type = 'EXPENSE' AND ${BRANCH} AND ${PERIOD} GROUP BY e.category`,
      params,
    ),
    // Long-distance subsidy: delivered orders (no failed-delivery refund) whose ongkir is below the courier's pay.
    // Vouchers are reported on their own line, so they are left out of this gap.
    db.query<{ orders: number; total: number }>(
      `SELECT count(*)::int AS orders, COALESCE(SUM(net), 0)::int AS total FROM (
         SELECT e.order_id, SUM(e.amount) FILTER (WHERE e.type IN ('ONGKIR_IN', 'COURIER_PAY')) AS net
         FROM platform_wallet_entries e
         WHERE e.order_id IS NOT NULL AND ${BRANCH} AND ${PERIOD}
         GROUP BY e.order_id
         HAVING NOT bool_or(e.type = 'ONGKIR_REFUND')
            AND SUM(e.amount) FILTER (WHERE e.type IN ('ONGKIR_IN', 'COURIER_PAY')) < 0
       ) s`,
      params,
    ),
  ]);
  const by_type = Object.fromEntries(PLATFORM_WALLET_TYPES.map((t) => [t, 0])) as Record<PlatformWalletType, number>;
  for (const r of byType.rows) by_type[r.type] = r.total;
  const expense_by_category = Object.fromEntries(PLATFORM_EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<
    PlatformExpenseCategory,
    number
  >;
  for (const r of byCategory.rows) expense_by_category[r.category] = r.total;
  return {
    balance: balance.rows[0]!.total,
    period: {
      net: Object.values(by_type).reduce((a, b) => a + b, 0),
      by_type,
      expense_by_category,
      subsidized_orders: subsidy.rows[0]!.orders,
      subsidy_total: subsidy.rows[0]!.total,
    },
  };
}

export async function listEntries(
  db: Db,
  f: WalletFilter,
  opts: { cursor?: string; limit: number },
): Promise<Pick<PlatformWalletResponse, "entries" | "next_cursor">> {
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const res = await db.query<{
    id: string;
    type: PlatformWalletType;
    category: PlatformExpenseCategory | null;
    amount: number;
    branch_id: string | null;
    branch_name: string | null;
    order_code: string | null;
    note: string | null;
    recorded_by_name: string | null;
    created_at: Date;
    created_cursor: string;
  }>(
    `SELECT e.id, e.type, e.category, e.amount, e.branch_id, b.name AS branch_name, o.code AS order_code, e.note,
            u.name AS recorded_by_name, e.created_at,
            to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor
     FROM platform_wallet_entries e
     LEFT JOIN branches b ON b.id = e.branch_id
     LEFT JOIN orders o ON o.id = e.order_id
     LEFT JOIN users u ON u.id = e.recorded_by
     WHERE ${BRANCH} AND ${PERIOD}
       AND ($4::timestamptz IS NULL OR (e.created_at, e.id) < ($4::timestamptz, $5::uuid))
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $6`,
    [f.branchId, f.from, f.to, after?.[0] ?? null, after?.[1] ?? null, opts.limit + 1],
  );
  const page = res.rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  const entries: PlatformWalletEntry[] = page.map((r) => ({
    id: r.id,
    type: r.type,
    category: r.category,
    amount: r.amount,
    branch_id: r.branch_id,
    branch_name: r.branch_name,
    order_code: r.order_code,
    note: r.note,
    recorded_by_name: r.recorded_by_name,
    created_at: r.created_at.toISOString(),
  }));
  return { entries, next_cursor: res.rows.length > opts.limit && last ? encodeCursor(last.created_cursor, last.id) : null };
}
