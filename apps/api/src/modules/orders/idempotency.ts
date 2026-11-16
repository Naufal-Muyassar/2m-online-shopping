import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { CreateOrderRequest, CreatedOrder } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";

type Db = Pool | Tx;

// Checkout idempotency (see docs/architecture/stock-and-checkout.md).
// Key: client-generated UUID, one per "Bayar" intent, namespaced by the authenticated customer.
// Claim: inserted first inside the order transaction, so claim + order + reservation commit or roll back together.
// Retention: 24 h. After that a reused key is a new checkout; the cart it emptied makes that a CART_EMPTY.

export const IDEMPOTENCY_HEADER = "idempotency-key";
const PURGE_BATCH = 500;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

// Every field of the validated request changes what the checkout means, so all of them are hashed.
export const fingerprint = (req: CreateOrderRequest): string =>
  createHash("sha256").update(JSON.stringify(["POST /orders", canonical(req)])).digest("hex");

// One atomic statement decides the owner. A concurrent copy of the same key waits here on the primary key
// until the owner commits (then sees its row) or rolls back (then becomes the owner itself).
export async function claim(
  tx: Tx,
  c: { customerId: string; key: string; requestHash: string; orderId: string },
): Promise<boolean> {
  const res = await tx.query(
    `INSERT INTO checkout_requests (customer_id, idempotency_key, request_hash, order_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (customer_id, idempotency_key) DO NOTHING`,
    [c.customerId, c.key, c.requestHash, c.orderId],
  );
  return res.rowCount === 1;
}

export async function findClaim(
  db: Db,
  customerId: string,
  key: string,
): Promise<{ request_hash: string; order_id: string } | null> {
  const res = await db.query<{ request_hash: string; order_id: string }>(
    `SELECT request_hash, order_id FROM checkout_requests WHERE customer_id = $1 AND idempotency_key = $2`,
    [customerId, key],
  );
  return res.rows[0] ?? null;
}

export function assertSameRequest(stored: string, incoming: string): void {
  if (stored !== incoming) {
    throw new AppError(
      422,
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used for a different checkout request",
    );
  }
}

// Rebuilds the original outcome for a completed duplicate. The order is read with the customer's id, so a key
// can never reveal another customer's order.
export async function replayOutcome(db: Db, customerId: string, orderId: string): Promise<CreatedOrder> {
  const res = await db.query<{
    id: string;
    code: string;
    status: CreatedOrder["status"];
    grand_total: number;
    created_at: Date;
    invoice_url: string | null;
    cancel_reason: string | null;
  }>(
    `SELECT o.id, o.code, o.status, o.grand_total, o.created_at, o.invoice_url,
            (SELECT t.reason FROM order_state_transitions t
             WHERE t.order_id = o.id AND t.to_status = 'CANCELLED' ORDER BY t.server_ts DESC, t.id DESC LIMIT 1) AS cancel_reason
     FROM orders o WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, customerId],
  );
  const o = res.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

  // The original request failed to start the payment and gave the cart back: the same answer, every time.
  if (o.status === "CANCELLED" && o.cancel_reason === "PAYMENT_INIT_FAILED") {
    throw new AppError(502, "PAYMENT_INIT_FAILED", "Could not start the payment, please try again");
  }
  // The original is still between the order commit and the invoice (or its process died there; reconciliation
  // settles it). Never start a second payment for it from here.
  if (o.status === "CREATED" || !o.invoice_url) {
    throw new AppError(409, "CHECKOUT_IN_PROGRESS", "This checkout is still being processed", { order_id: o.id });
  }
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    grand_total: o.grand_total,
    created_at: o.created_at.toISOString(),
    invoice_url: o.invoice_url,
  };
}

export async function purgeExpired(db: Db): Promise<number> {
  const res = await db.query(
    `DELETE FROM checkout_requests WHERE ctid = ANY(ARRAY(
       SELECT ctid FROM checkout_requests WHERE expires_at < now() LIMIT $1
     ))`,
    [PURGE_BATCH],
  );
  return res.rowCount ?? 0;
}
