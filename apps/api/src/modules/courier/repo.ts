import type { Pool } from "pg";
import type { CourierOrder, CourierStatus, PingsRequest } from "@2m/shared";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

export interface CourierRow {
  user_id: string;
  name: string;
  branch_id: string;
  partner_id: string;
  status: CourierStatus;
  last_status_change: Date;
  last_ping_at: Date | null;
}

export async function getCourier(db: Db, userId: string, lock = false): Promise<CourierRow | null> {
  const res = await db.query<CourierRow>(
    `SELECT c.user_id, u.name, c.branch_id, c.partner_id, c.status, c.last_status_change, c.last_ping_at
     FROM couriers c JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1${lock ? " FOR UPDATE OF c" : ""}`,
    [userId],
  );
  return res.rows[0] ?? null;
}

export async function setCourierStatus(tx: Tx, courierId: string, status: CourierStatus): Promise<void> {
  await tx.query(
    `UPDATE couriers SET status = $2::courier_status, last_status_change = now() WHERE user_id = $1 AND status <> $2::courier_status`,
    [courierId, status],
  );
}

const ACTIVE = `(o.status IN ('ASSIGNED','ON_DELIVERY') OR (o.status = 'FAILED' AND o.return_pending))`;

interface OrderCardRow {
  id: string;
  code: string;
  status: CourierOrder["status"];
  return_pending: boolean;
  grand_total: number;
  ready_at: Date | null;
  delivered_at: Date | null;
  updated_at: Date;
  street: string;
  rt_rw: string | null;
  unit: string | null;
  courier_note: string | null;
  receiver_name: string;
  receiver_phone: string;
  lat: number;
  lng: number;
}

async function loadCards(db: Db, where: string, params: unknown[], tail = ""): Promise<CourierOrder[]> {
  const orders = await db.query<OrderCardRow>(
    `SELECT o.id, o.code, o.status, o.return_pending, o.grand_total, o.ready_at, o.delivered_at, o.updated_at,
            a.street, a.rt_rw, a.unit, a.courier_note, a.receiver_name, a.receiver_phone, a.lat, a.lng
     FROM orders o JOIN addresses a ON a.id = o.address_id
     WHERE ${where} ${tail}`,
    params,
  );
  if (orders.rows.length === 0) return [];
  const items = await db.query<{ order_id: string; sku: string; name: string; qty: number; weight_kg: number }>(
    `SELECT order_id, sku, name, qty, weight_kg::float8 AS weight_kg FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY name`,
    [orders.rows.map((o) => o.id)],
  );
  return orders.rows.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    return_pending: o.return_pending,
    grand_total: o.grand_total,
    ready_at: o.ready_at?.toISOString() ?? null,
    delivered_at: o.delivered_at?.toISOString() ?? null,
    updated_at: o.updated_at.toISOString(),
    items: items.rows.filter((i) => i.order_id === o.id).map(({ sku, name, qty, weight_kg }) => ({ sku, name, qty, weight_kg })),
    address: {
      street: o.street,
      rt_rw: o.rt_rw,
      unit: o.unit,
      courier_note: o.courier_note,
      receiver_name: o.receiver_name,
      receiver_phone: o.receiver_phone,
      lat: o.lat,
      lng: o.lng,
    },
  }));
}

export const listActiveOrders = (db: Db, courierId: string) =>
  loadCards(db, `o.assigned_courier_id = $1 AND ${ACTIVE}`, [courierId], "ORDER BY o.updated_at ASC");

export const listRecentOrders = (db: Db, courierId: string) =>
  loadCards(
    db,
    `o.assigned_courier_id = $1 AND o.status IN ('DELIVERED','FAILED') AND NOT ${ACTIVE}`,
    [courierId],
    "ORDER BY o.updated_at DESC LIMIT 10",
  );

export async function getCourierOrder(db: Db, courierId: string, orderId: string): Promise<CourierOrder | null> {
  const cards = await loadCards(db, "o.id = $1 AND o.assigned_courier_id = $2", [orderId, courierId]);
  return cards[0] ?? null;
}

export async function getAssignedOrder(
  db: Db,
  courierId: string,
  orderId: string,
): Promise<{ id: string; branch_id: string; status: string } | null> {
  const res = await db.query(`SELECT id, branch_id, status FROM orders WHERE id = $1 AND assigned_courier_id = $2`, [
    orderId,
    courierId,
  ]);
  return res.rows[0] ?? null;
}

export async function upsertProof(
  tx: Tx,
  p: { orderId: string; branchId: string; photoKey: string; lat: number; lng: number },
): Promise<void> {
  await tx.query(
    `INSERT INTO proof_of_delivery (order_id, branch_id, photo_key, lat, lng)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (order_id) DO UPDATE SET photo_key = EXCLUDED.photo_key, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
    [p.orderId, p.branchId, p.photoKey, p.lat, p.lng],
  );
}

// order_id is kept only when the order is assigned to this courier.
export async function insertPings(tx: Tx, courierId: string, branchId: string, pings: PingsRequest["pings"]): Promise<void> {
  await tx.query(
    `INSERT INTO courier_pings (courier_id, branch_id, order_id, lat, lng, accuracy, battery, client_ts)
     SELECT $1, $2, o.id, p.lat, p.lng, p.accuracy, p.battery, p.client_ts
     FROM unnest($3::float8[], $4::float8[], $5::float8[], $6::int[], $7::uuid[], $8::timestamptz[])
       AS p(lat, lng, accuracy, battery, order_id, client_ts)
     LEFT JOIN orders o ON o.id = p.order_id AND o.assigned_courier_id = $1`,
    [
      courierId,
      branchId,
      pings.map((p) => p.lat),
      pings.map((p) => p.lng),
      pings.map((p) => p.accuracy),
      pings.map((p) => p.battery ?? null),
      pings.map((p) => p.order_id ?? null),
      pings.map((p) => p.client_ts),
    ],
  );
}

export async function touchCourierLocation(tx: Tx, courierId: string, lat: number, lng: number): Promise<void> {
  await tx.query(`UPDATE couriers SET current_lat = $2, current_lng = $3, last_ping_at = now() WHERE user_id = $1`, [
    courierId,
    lat,
    lng,
  ]);
}
