import { randomInt } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  FAILURE_LABELS,
  FAILURE_LABEL_DEFAULT,
  customerOrderDetailSchema,
  type CreateOrderRequest,
  type CreatedOrder,
  type CustomerOrderDetail,
  type OrderListItem,
  type OrderListResponse,
} from "@2m/shared";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { presignGet } from "../../shared/storage";
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

// Keyset cursor over (created_at, id). The timestamp travels as microsecond-precision text: a JS Date would truncate it.
const cursorSchema = z.tuple([z.string().datetime({ offset: true }), z.string().uuid()]);

function decodeCursor(cursor: string): [string, string] {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Invalid cursor");
  }
}

export async function listCustomerOrders(
  db: Db,
  userId: string,
  opts: { cursor?: string; limit: number },
): Promise<OrderListResponse> {
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  const res = await db.query<{
    id: string;
    code: string;
    status: OrderListItem["status"];
    created_at: Date;
    created_cursor: string;
    grand_total: number;
    item_count: number;
    branch_name: string;
  }>(
    `SELECT o.id, o.code, o.status, o.created_at, o.grand_total, b.name AS branch_name,
            to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor,
            (SELECT count(*)::int FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o JOIN branches b ON b.id = o.branch_id
     WHERE o.customer_id = $1 AND ($2::timestamptz IS NULL OR (o.created_at, o.id) < ($2::timestamptz, $3::uuid))
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $4`,
    [userId, after?.[0] ?? null, after?.[1] ?? null, opts.limit + 1],
  );
  const page = res.rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    orders: page.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      created_at: r.created_at.toISOString(),
      grand_total: r.grand_total,
      item_count: r.item_count,
      branch_name: r.branch_name,
    })),
    next_cursor:
      res.rows.length > opts.limit && last
        ? Buffer.from(JSON.stringify([last.created_cursor, last.id])).toString("base64url")
        : null,
  };
}

export async function getCustomerOrder(userId: string, orderId: string): Promise<CustomerOrderDetail> {
  const orderRes = await pool.query(
    `SELECT o.id, o.code, o.status, o.created_at, o.subtotal, o.delivery_fee, o.payment_fee, o.voucher_discount,
            o.grand_total, o.route_distance_km::float8 AS route_distance_km, o.payment_method,
            o.invoice_url, o.invoice_expires_at, b.name AS branch_name,
            split_part(cu.name, ' ', 1) AS courier_first_name,
            a.label, a.street, a.rt_rw, a.unit, a.receiver_name, a.receiver_phone, a.courier_note, a.lat, a.lng
     FROM orders o
     JOIN branches b ON b.id = o.branch_id
     JOIN addresses a ON a.id = o.address_id
     LEFT JOIN users cu ON cu.id = o.assigned_courier_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, userId],
  );
  const o = orderRes.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  const [items, transitions, proofRes] = await Promise.all([
    pool.query(
      `SELECT i.name, p.unit, i.qty, COALESCE(i.picked_qty, 0) AS picked_qty, i.unit_price
       FROM order_items i JOIN products p ON p.id = i.product_id
       WHERE i.order_id = $1 ORDER BY i.name, i.id`,
      [orderId],
    ),
    pool.query(
      `SELECT to_status AS status, server_ts, reason FROM order_state_transitions
       WHERE order_id = $1 ORDER BY server_ts, id`,
      [orderId],
    ),
    o.status === "DELIVERED" || o.status === "FAILED"
      ? pool.query(`SELECT photo_key, COALESCE(taken_at, created_at) AS taken_at FROM proof_of_delivery WHERE order_id = $1`, [orderId])
      : Promise.resolve({ rows: [] as { photo_key: string; taken_at: Date }[] }),
  ]);

  const iso = (d: Date) => d.toISOString();
  const paidAt = transitions.rows.find((t) => t.status === "PAID")?.server_ts as Date | undefined;
  const exitTransition = [...transitions.rows].reverse().find((t) => t.status === o.status);
  const proofRow = proofRes.rows[0];

  return customerOrderDetailSchema.parse({
    order: {
      id: o.id,
      code: o.code,
      status: o.status,
      created_at: iso(o.created_at),
      paid_at: paidAt ? iso(paidAt) : null,
      branch_name: o.branch_name,
    },
    invoice_url: o.status === "PENDING_PAYMENT" ? o.invoice_url : null,
    invoice_expires_at: o.status === "PENDING_PAYMENT" && o.invoice_expires_at ? iso(o.invoice_expires_at) : null,
    items: items.rows.map((i) => ({
      name: i.name,
      unit: i.unit,
      qty: i.qty,
      picked_qty: i.picked_qty,
      unit_price: i.unit_price,
      line_total: i.unit_price * i.qty,
    })),
    pricing: {
      subtotal: o.subtotal,
      delivery_fee: o.delivery_fee,
      voucher_discount: o.voucher_discount,
      payment_fee: o.payment_fee,
      grand_total: o.grand_total,
      route_distance_km: o.route_distance_km,
    },
    address: {
      label: o.label,
      street: o.street,
      rt_rw: o.rt_rw,
      unit: o.unit,
      receiver_name: o.receiver_name,
      receiver_phone: o.receiver_phone,
      courier_note: o.courier_note,
      lat: o.lat,
      lng: o.lng,
    },
    payment: { method: o.payment_method, paid_at: paidAt ? iso(paidAt) : null },
    timeline: transitions.rows.map((t) => ({ status: t.status, at: iso(t.server_ts) })),
    courier:
      COURIER_VISIBLE.includes(o.status) && o.courier_first_name ? { first_name: o.courier_first_name } : null,
    failure:
      o.status === "FAILED" || o.status === "CANCELLED"
        ? (FAILURE_LABELS[exitTransition?.reason ?? ""] ?? FAILURE_LABEL_DEFAULT)
        : null,
    proof: proofRow ? { photo_url: await presignGet(proofRow.photo_key), taken_at: iso(proofRow.taken_at) } : null,
    tracking_available: o.status === "ON_DELIVERY",
  });
}
