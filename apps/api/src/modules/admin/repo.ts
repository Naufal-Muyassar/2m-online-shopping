import type { Pool } from "pg";
import type { AdminCourier, AdminOrder, CourierRelease } from "@2m/shared";
import type { Tx } from "../../shared/db";

interface AdminOrderRow {
  id: string;
  code: string;
  status: AdminOrder["status"];
  grand_total: number;
  return_pending: boolean;
  created_at: Date;
  ready_at: Date | null;
  last_transition_at: Date | null;
  courier_id: string | null;
  courier_name: string | null;
  receiver_name: string;
  area_hint: string;
  lat: number;
  lng: number;
}

// Without a date: non-terminal orders, terminal ones from the last 24h, and failed orders still waiting
// for return confirmation. With a date (YYYY-MM-DD): every order created that day in the branch's timezone.
const LIVE_FILTER = `(o.status NOT IN ('DELIVERED','FAILED','CANCELLED')
            OR o.return_pending
            OR o.updated_at >= now() - interval '24 hours')`;
const DATE_FILTER = `(o.created_at AT TIME ZONE (SELECT b.timezone FROM branches b WHERE b.id = o.branch_id))::date = $2::date`;

export async function listBoardOrders(db: Pool, branchId: string, date?: string): Promise<AdminOrder[]> {
  const res = await db.query<AdminOrderRow>(
    `SELECT o.id, o.code, o.status, o.grand_total, o.return_pending, o.created_at, o.ready_at,
            (SELECT max(t.server_ts) FROM order_state_transitions t WHERE t.order_id = o.id) AS last_transition_at,
            u.id AS courier_id, u.name AS courier_name,
            a.receiver_name, left(a.street, 40) AS area_hint, a.lat, a.lng
     FROM orders o
     JOIN addresses a ON a.id = o.address_id
     LEFT JOIN users u ON u.id = o.assigned_courier_id
     WHERE o.branch_id = $1
       AND ${date ? DATE_FILTER : LIVE_FILTER}
     ORDER BY o.created_at ASC`,
    date ? [branchId, date] : [branchId],
  );
  const items = await db.query<{ order_id: string; name: string; qty: number }>(
    `SELECT order_id, name, qty FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY name`,
    [res.rows.map((r) => r.id)],
  );
  const itemsOf = (orderId: string) =>
    items.rows.filter((i) => i.order_id === orderId).map((i) => ({ name: i.name, qty: i.qty }));
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    grand_total: r.grand_total,
    return_pending: r.return_pending,
    created_at: r.created_at.toISOString(),
    ready_at: r.ready_at?.toISOString() ?? null,
    last_transition_at: r.last_transition_at?.toISOString() ?? null,
    assigned_courier: r.courier_id && r.courier_name ? { user_id: r.courier_id, name: r.courier_name } : null,
    receiver_name: r.receiver_name,
    area_hint: r.area_hint,
    destination: { lat: r.lat, lng: r.lng },
    items: itemsOf(r.id),
  }));
}

interface AdminCourierRow {
  user_id: string;
  name: string;
  partner_name: string;
  status: AdminCourier["status"];
  last_status_change: Date;
  last_ping_at: Date | null;
  motor_cluster: string | null;
  balance: number;
  current_lat: number | null;
  current_lng: number | null;
  order_id: string | null;
  order_code: string | null;
  order_status: AdminOrder["status"] | null;
}

export async function listBranchCouriers(db: Pool, branchId: string): Promise<AdminCourier[]> {
  const res = await db.query<AdminCourierRow>(
    `SELECT c.user_id, u.name, p.name AS partner_name, c.status, c.last_status_change, c.last_ping_at, c.motor_cluster, c.current_lat, c.current_lng,
            COALESCE((SELECT SUM(l.amount) FROM courier_ledger_entries l WHERE l.courier_id = c.user_id), 0)::int AS balance,
            o.id AS order_id, o.code AS order_code, o.status AS order_status
     FROM couriers c
     JOIN users u ON u.id = c.user_id
     JOIN courier_partners p ON p.id = c.partner_id
     LEFT JOIN LATERAL (
       SELECT id, code, status FROM orders
       WHERE assigned_courier_id = c.user_id
         AND (status IN ('PICKING','ON_DELIVERY') OR (status = 'FAILED' AND return_pending))
       ORDER BY updated_at DESC LIMIT 1
     ) o ON true
     WHERE c.branch_id = $1
     ORDER BY u.name`,
    [branchId],
  );
  return res.rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    partner_name: r.partner_name,
    status: r.status,
    last_status_change: r.last_status_change.toISOString(),
    last_ping_at: r.last_ping_at?.toISOString() ?? null,
    motor_cluster: r.motor_cluster,
    balance: r.balance,
    position: r.status !== "OFFLINE" && r.current_lat !== null && r.current_lng !== null ? { lat: r.current_lat, lng: r.current_lng } : null,
    current_order: r.order_id && r.order_code && r.order_status ? { id: r.order_id, code: r.order_code, status: r.order_status } : null,
  }));
}

export async function listActivePartners(db: Pool): Promise<{ id: string; name: string }[]> {
  const res = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM courier_partners WHERE is_active ORDER BY name`,
  );
  return res.rows;
}

export async function partnerIsActive(tx: Tx, partnerId: string): Promise<boolean> {
  const res = await tx.query(`SELECT 1 FROM courier_partners WHERE id = $1 AND is_active`, [partnerId]);
  return (res.rowCount ?? 0) > 0;
}

export async function insertCourier(
  tx: Tx,
  c: { branchId: string; partnerId: string; name: string; phone: string; passwordHash: string },
): Promise<{ user_id: string; name: string; phone: string }> {
  const user = await tx.query<{ id: string; name: string; phone: string }>(
    `INSERT INTO users (role, name, phone, password_hash, branch_id)
     VALUES ('courier', $1, $2, $3, $4) RETURNING id, name, phone`,
    [c.name, c.phone, c.passwordHash, c.branchId],
  );
  const u = user.rows[0]!;
  await tx.query(`INSERT INTO couriers (user_id, partner_id, branch_id) VALUES ($1, $2, $3)`, [u.id, c.partnerId, c.branchId]);
  return { user_id: u.id, name: u.name, phone: u.phone };
}

export async function courierInBranch(db: Pool, courierId: string, branchId: string): Promise<boolean> {
  const res = await db.query(`SELECT 1 FROM couriers WHERE user_id = $1 AND branch_id = $2`, [courierId, branchId]);
  return (res.rowCount ?? 0) > 0;
}

// A courier giving an order back is a PICKING -> ACCEPTED transition they made themselves.
export async function listCourierReleases(db: Pool, courierId: string, limit = 50): Promise<CourierRelease[]> {
  const res = await db.query<{ order_id: string; order_code: string; reason: string | null; server_ts: Date }>(
    `SELECT t.order_id, o.code AS order_code, t.reason, t.server_ts
     FROM order_state_transitions t JOIN orders o ON o.id = t.order_id
     WHERE t.actor_id = $1 AND t.actor_role = 'courier'
       AND t.from_status = 'PICKING' AND t.to_status = 'ACCEPTED'
     ORDER BY t.server_ts DESC LIMIT $2`,
    [courierId, limit],
  );
  return res.rows.map((r) => ({
    order_id: r.order_id,
    order_code: r.order_code,
    reason: r.reason ?? "-",
    released_at: r.server_ts.toISOString(),
  }));
}
