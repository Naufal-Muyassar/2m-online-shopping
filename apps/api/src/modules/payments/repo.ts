import type { Pool } from "pg";
import type { OrderStatus } from "@2m/shared";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

export interface LockedOrder {
  id: string;
  code: string;
  branch_id: string;
  status: OrderStatus;
  grand_total: number;
  invoice_id: string | null;
}

export async function lockOrderByCode(tx: Tx, code: string): Promise<LockedOrder | null> {
  const res = await tx.query<LockedOrder>(
    `SELECT id, code, branch_id, status, grand_total, invoice_id FROM orders WHERE code = $1 FOR UPDATE`,
    [code],
  );
  return res.rows[0] ?? null;
}

export interface PaymentEventInput {
  invoiceId: string;
  externalId: string | null;
  status: string;
  rawBody: string;
  headers: Record<string, unknown>;
}

// A duplicate (invoice_id, status) returns the stored row, so the caller can skip work that is already processed.
export async function recordEvent(db: Db, e: PaymentEventInput): Promise<{ id: string; processed: boolean }> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO payment_events (invoice_id, external_id, status, raw_body, headers)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (invoice_id, status) DO NOTHING
     RETURNING id`,
    [e.invoiceId, e.externalId, e.status, e.rawBody, JSON.stringify(e.headers)],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, processed: false };
  const existing = await db.query<{ id: string; processed_at: Date | null }>(
    `SELECT id, processed_at FROM payment_events WHERE invoice_id = $1 AND status = $2`,
    [e.invoiceId, e.status],
  );
  const row = existing.rows[0]!;
  return { id: row.id, processed: row.processed_at !== null };
}

export async function markEventProcessed(db: Db, id: string, outcome: string): Promise<void> {
  await db.query(
    `UPDATE payment_events SET processed_at = COALESCE(processed_at, now()), outcome = COALESCE(outcome, $2) WHERE id = $1`,
    [id, outcome],
  );
}

export interface PendingInvoiceOrder {
  id: string;
  code: string;
  invoice_id: string;
}

// Orders whose invoice has expired or that have waited longer than maxAgeMin: Xendit is asked for the truth.
export async function listStalePending(db: Db, maxAgeMin: number, limit: number): Promise<PendingInvoiceOrder[]> {
  const res = await db.query<PendingInvoiceOrder>(
    `SELECT id, code, invoice_id FROM orders
     WHERE status = 'PENDING_PAYMENT' AND invoice_id IS NOT NULL
       AND (invoice_expires_at < now() OR created_at < now() - make_interval(mins => $1))
     ORDER BY created_at
     LIMIT $2`,
    [maxAgeMin, limit],
  );
  return res.rows;
}

// Orders that never got their invoice attached (crash between Tx1 and Tx2).
export async function listStuckCreated(db: Db, maxAgeMin: number, limit: number): Promise<{ id: string; code: string }[]> {
  const res = await db.query<{ id: string; code: string }>(
    `SELECT id, code FROM orders
     WHERE status = 'CREATED' AND created_at < now() - make_interval(mins => $1)
     ORDER BY created_at
     LIMIT $2`,
    [maxAgeMin, limit],
  );
  return res.rows;
}

export interface PaymentOrderInfo {
  id: string;
  code: string;
  branch_id: string;
  customer_id: string;
  grand_total: number;
  payment_method: string | null;
}

export async function getOrderForPayment(db: Db, orderId: string): Promise<PaymentOrderInfo | null> {
  const res = await db.query<PaymentOrderInfo>(
    `SELECT id, code, branch_id, customer_id, grand_total, payment_method FROM orders WHERE id = $1`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

// Gives the customer their cart back when the order could not be sent to the payment provider.
export async function restoreCart(tx: Tx, orderId: string): Promise<void> {
  await tx.query(
    `INSERT INTO cart_items (cart_id, branch_id, product_id, qty)
     SELECT c.id, oi.branch_id, oi.product_id, oi.qty
     FROM orders o
     JOIN carts c ON c.user_id = o.customer_id AND c.branch_id = o.branch_id
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     ON CONFLICT (cart_id, product_id) DO NOTHING`,
    [orderId],
  );
}
