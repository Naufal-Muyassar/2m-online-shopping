import type { Pool } from "pg";
import type { AdminCourier, AdminOrder } from "@2m/shared";

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
}

// Non-terminal orders, terminal ones from the last 24h, and failed orders still waiting for return confirmation.
export async function listBoardOrders(db: Pool, branchId: string): Promise<AdminOrder[]> {
  const res = await db.query<AdminOrderRow>(
    `SELECT o.id, o.code, o.status, o.grand_total, o.return_pending, o.created_at, o.ready_at,
            (SELECT max(t.server_ts) FROM order_state_transitions t WHERE t.order_id = o.id) AS last_transition_at,
            u.id AS courier_id, u.name AS courier_name
     FROM orders o LEFT JOIN users u ON u.id = o.assigned_courier_id
     WHERE o.branch_id = $1
       AND (o.status NOT IN ('DELIVERED','FAILED','CANCELLED')
            OR o.return_pending
            OR o.updated_at >= now() - interval '24 hours')
     ORDER BY o.created_at ASC`,
    [branchId],
  );
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
  order_id: string | null;
  order_code: string | null;
  order_status: AdminOrder["status"] | null;
}

export async function listBranchCouriers(db: Pool, branchId: string): Promise<AdminCourier[]> {
  const res = await db.query<AdminCourierRow>(
    `SELECT c.user_id, u.name, p.name AS partner_name, c.status, c.last_status_change, c.last_ping_at, c.motor_cluster,
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
    current_order: r.order_id && r.order_code && r.order_status ? { id: r.order_id, code: r.order_code, status: r.order_status } : null,
  }));
}
