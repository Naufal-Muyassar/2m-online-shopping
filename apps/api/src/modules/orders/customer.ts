import { randomInt } from "node:crypto";
import type { Pool } from "pg";
import type { CreateOrderRequest, CreatedOrder, CustomerOrderDetail, OrderSummary } from "@2m/shared";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { clearCart } from "../cart/repo";
import { cancelReservation, reserveForOrder, type Reservation } from "../inventory/service";
import { INVOICE_DURATION_SEC, initiatePayment } from "../payments/service";
import { quote } from "../pricing/service";

type Db = Pool | Tx;

// Held past the invoice lifetime so a payment that lands late is still settled by reconciliation (every 5 min).
const RESERVATION_TTL_SEC = INVOICE_DURATION_SEC + 600;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Statuses in which an assigned courier is shown to the customer.
const COURIER_VISIBLE: readonly string[] = ["PICKING", "ON_DELIVERY", "DELIVERED", "FAILED"];

function newCode(): string {
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `ORD-${day}-${suffix}`;
}

export async function createOrder(userId: string, req: CreateOrderRequest): Promise<CreatedOrder> {
  // Tx1: order CREATED + items + stock reservation + empty cart. The payment provider is called after it commits, never inside it.
  const held: { reservation?: Reservation } = {};
  let created: { id: string; created_at: Date };
  try {
    created = await withTransaction(async (tx) => {
      const q = await quote(tx, userId, req, { lockCart: true });
      const b = q.breakdown;

      let inserted: { id: string; created_at: Date } | undefined;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const res = await tx.query<{ id: string; created_at: Date }>(
          `INSERT INTO orders (code, branch_id, customer_id, address_id, status, subtotal, delivery_fee, payment_fee,
                               voucher_discount, grand_total, pricing_snapshot, payment_method, is_bulk_order,
                               route_distance_km, courier_wage)
           VALUES ($1,$2,$3,$4,'CREATED',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (code) DO NOTHING
           RETURNING id, created_at`,
          [
            newCode(), req.branch_id, userId, req.address_id, b.subtotal, b.final_shipping_cost, b.payment_fee,
            b.voucher_discount, b.grand_total,
            JSON.stringify({ ...b, ...q.snapshotExtra, address_id: req.address_id, payment_method: req.payment_method }),
            req.payment_method, q.isBulkOrder, b.route_distance_km, q.courierWage,
          ],
        );
        inserted = res.rows[0];
      }
      if (!inserted) throw new AppError(500, "INTERNAL", "Could not allocate an order code");

      for (const l of q.lines) {
        await tx.query(
          `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [inserted.id, req.branch_id, l.product_id, l.sku, l.name, l.qty, l.price, l.weight_kg],
        );
      }
      held.reservation = await reserveForOrder(tx, {
        orderId: inserted.id,
        branchId: req.branch_id,
        lines: q.lines,
        ttlSec: RESERVATION_TTL_SEC,
      });
      await clearCart(tx, q.cartId);
      return inserted;
    });
  } catch (err) {
    if (held.reservation) await cancelReservation(held.reservation);
    throw err;
  }

  // Tx2 (inside): CREATED → PENDING_PAYMENT with the invoice. A provider failure cancels the order.
  const { order, invoice } = await initiatePayment(created.id);
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    grand_total: order.grand_total,
    created_at: created.created_at.toISOString(),
    invoice_url: invoice.invoiceUrl,
  };
}

export async function listCustomerOrders(db: Db, userId: string): Promise<OrderSummary[]> {
  const res = await db.query<Omit<OrderSummary, "created_at"> & { created_at: Date }>(
    `SELECT id, code, status, grand_total, created_at FROM orders
     WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return res.rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

export async function getCustomerOrder(userId: string, orderId: string): Promise<CustomerOrderDetail> {
  const orderRes = await pool.query(
    `SELECT o.id, o.code, o.status, o.grand_total, o.subtotal, o.delivery_fee, o.payment_fee, o.voucher_discount,
            o.payment_method, o.created_at, o.invoice_url, o.invoice_expires_at,
            split_part(cu.name, ' ', 1) AS courier_first_name
     FROM orders o LEFT JOIN users cu ON cu.id = o.assigned_courier_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, userId],
  );
  const o = orderRes.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const [items, timeline] = await Promise.all([
    pool.query(`SELECT sku, name, qty, unit_price FROM order_items WHERE order_id = $1 ORDER BY name`, [orderId]),
    pool.query(
      `SELECT to_status AS status, server_ts, reason FROM order_state_transitions WHERE order_id = $1 ORDER BY id`,
      [orderId],
    ),
  ]);
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    grand_total: o.grand_total,
    created_at: (o.created_at as Date).toISOString(),
    invoice_url: o.status === "PENDING_PAYMENT" ? o.invoice_url : null,
    invoice_expires_at:
      o.status === "PENDING_PAYMENT" && o.invoice_expires_at ? (o.invoice_expires_at as Date).toISOString() : null,
    subtotal: o.subtotal,
    delivery_fee: o.delivery_fee,
    payment_fee: o.payment_fee,
    voucher_discount: o.voucher_discount,
    payment_method: o.payment_method,
    courier_first_name: COURIER_VISIBLE.includes(o.status) ? (o.courier_first_name ?? null) : null,
    items: items.rows,
    timeline: timeline.rows.map((t) => ({
      status: t.status,
      at: (t.server_ts as Date).toISOString(),
      reason: t.reason,
    })),
  };
}
