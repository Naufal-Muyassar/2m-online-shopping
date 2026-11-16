import type { Pool } from "pg";
import type { RefundReason, RefundStatus } from "@2m/shared";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

export interface RefundRow {
  id: string;
  order_id: string;
  branch_id: string;
  customer_id: string;
  reason: RefundReason;
  note: string | null;
  amount: number;
  dedupe_key: string;
  status: RefundStatus;
  dest_method: "BANK" | "EWALLET" | null;
  dest_provider: string | null;
  dest_account_no: string | null;
  dest_account_name: string | null;
  transfer_ref: string | null;
  proof_key: string | null;
  created_at: Date;
  completed_at: Date | null;
}

const COLUMNS = `r.id, r.order_id, r.branch_id, r.customer_id, r.reason, r.note, r.amount, r.dedupe_key, r.status,
  r.dest_method, r.dest_provider, r.dest_account_no, r.dest_account_name, r.transfer_ref, r.proof_key,
  r.created_at, r.completed_at`;

// Caller must hold the order row lock, so the sum and the insert cannot interleave with another refund.
export async function refundedTotal(tx: Tx, orderId: string): Promise<number> {
  const res = await tx.query<{ total: number }>(
    `SELECT COALESCE(sum(amount), 0)::int AS total FROM refunds WHERE order_id = $1`,
    [orderId],
  );
  return res.rows[0]!.total;
}

// ON CONFLICT: a replayed event or a retried admin request finds the refund it already opened.
export async function insertRefund(
  tx: Tx,
  r: {
    orderId: string;
    branchId: string;
    customerId: string;
    reason: RefundReason;
    note: string | null;
    amount: number;
    dedupeKey: string;
    createdBy: string | null;
  },
): Promise<RefundRow | null> {
  const res = await tx.query<RefundRow>(
    `INSERT INTO refunds AS r (order_id, branch_id, customer_id, reason, note, amount, dedupe_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (order_id, dedupe_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [r.orderId, r.branchId, r.customerId, r.reason, r.note, r.amount, r.dedupeKey, r.createdBy],
  );
  return res.rows[0] ?? null;
}

export async function findByDedupeKey(db: Db, orderId: string, dedupeKey: string): Promise<RefundRow | null> {
  const res = await db.query<RefundRow>(`SELECT ${COLUMNS} FROM refunds r WHERE r.order_id = $1 AND r.dedupe_key = $2`, [
    orderId,
    dedupeKey,
  ]);
  return res.rows[0] ?? null;
}

export async function findById(db: Db, id: string): Promise<RefundRow | null> {
  const res = await db.query<RefundRow>(`SELECT ${COLUMNS} FROM refunds r WHERE r.id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function listForOrder(db: Db, orderId: string): Promise<RefundRow[]> {
  const res = await db.query<RefundRow>(`SELECT ${COLUMNS} FROM refunds r WHERE r.order_id = $1 ORDER BY r.created_at DESC, r.id`, [
    orderId,
  ]);
  return res.rows;
}

// Conditional: never rewrites the destination of a refund that was already paid out.
export async function setDestination(
  db: Db,
  d: { refundId: string; orderId: string; customerId: string; method: string; provider: string; accountNo: string; accountName: string },
): Promise<RefundRow | null> {
  const res = await db.query<RefundRow>(
    `UPDATE refunds r SET dest_method = $4, dest_provider = $5, dest_account_no = $6, dest_account_name = $7,
            dest_set_at = now(), status = 'READY', updated_at = now()
     WHERE r.id = $1 AND r.order_id = $2 AND r.customer_id = $3 AND r.status <> 'COMPLETED'
     RETURNING ${COLUMNS}`,
    [d.refundId, d.orderId, d.customerId, d.method, d.provider, d.accountNo, d.accountName],
  );
  return res.rows[0] ?? null;
}

// The only way to COMPLETED: from READY, in one statement, so two admins cannot both close it.
export async function complete(
  tx: Tx,
  c: { refundId: string; branchId: string; adminId: string; transferRef: string; proofKey: string },
): Promise<RefundRow | null> {
  const res = await tx.query<RefundRow>(
    `UPDATE refunds r SET status = 'COMPLETED', transfer_ref = $4, proof_key = $5, completed_by = $3,
            completed_at = now(), updated_at = now()
     WHERE r.id = $1 AND r.branch_id = $2 AND r.status = 'READY'
     RETURNING ${COLUMNS}`,
    [c.refundId, c.branchId, c.adminId, c.transferRef, c.proofKey],
  );
  return res.rows[0] ?? null;
}

export interface AdminRefundRow extends RefundRow {
  order_code: string;
  order_status: string;
  customer_name: string;
  completed_by_name: string | null;
}

export async function listForBranch(db: Db, branchId: string, completed: boolean): Promise<AdminRefundRow[]> {
  const res = await db.query<AdminRefundRow>(
    `SELECT ${COLUMNS}, o.code AS order_code, o.status AS order_status, cu.name AS customer_name,
            ad.name AS completed_by_name
     FROM refunds r
     JOIN orders o ON o.id = r.order_id
     JOIN users cu ON cu.id = r.customer_id
     LEFT JOIN users ad ON ad.id = r.completed_by
     WHERE r.branch_id = $1 AND (r.status = 'COMPLETED') = $2
     ORDER BY ${completed ? "r.completed_at DESC" : "r.created_at ASC"}, r.id
     LIMIT 200`,
    [branchId, completed],
  );
  return res.rows;
}
