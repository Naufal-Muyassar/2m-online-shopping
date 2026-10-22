import type { Pool } from "pg";
import type { OrderStatus } from "@2m/shared";
import type { Tx } from "../../shared/db";

export interface OrderRow {
  id: string;
  code: string;
  branch_id: string;
  status: OrderStatus;
  grand_total: number;
  assigned_courier_id: string | null;
  return_pending: boolean;
  ready_at: Date | null;
  delivered_at: Date | null;
  updated_at: Date;
}

export const ORDER_COLUMNS =
  "id, code, branch_id, status, grand_total, assigned_courier_id, return_pending, ready_at, delivered_at, updated_at";

export async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow | null> {
  const res = await tx.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  return res.rows[0] ?? null;
}

export async function getOrderBranch(db: Pool | Tx, orderId: string): Promise<string | null> {
  const res = await db.query<{ branch_id: string }>(`SELECT branch_id FROM orders WHERE id = $1`, [orderId]);
  return res.rows[0]?.branch_id ?? null;
}

export async function transitionKeyExists(tx: Tx, orderId: string, key: string): Promise<boolean> {
  const res = await tx.query(
    `SELECT 1 FROM order_state_transitions WHERE order_id = $1 AND idempotency_key = $2`,
    [orderId, key],
  );
  return res.rowCount === 1;
}

export async function hasProof(tx: Tx, orderId: string): Promise<boolean> {
  const res = await tx.query(`SELECT 1 FROM proof_of_delivery WHERE order_id = $1`, [orderId]);
  return res.rowCount === 1;
}

export async function courierInBranch(tx: Tx, courierId: string, branchId: string): Promise<boolean> {
  const res = await tx.query(`SELECT 1 FROM couriers WHERE user_id = $1 AND branch_id = $2`, [courierId, branchId]);
  return res.rowCount === 1;
}

export async function clearReturnPending(tx: Tx, orderId: string): Promise<void> {
  await tx.query(`UPDATE orders SET return_pending = false, updated_at = now() WHERE id = $1`, [orderId]);
}

export interface OrderUpdate {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  setCourierId: string | null | undefined;
  setReadyAt: boolean;
  setDeliveredAt: boolean;
  setReturnPending: boolean;
}

// The only statement in the codebase that writes orders.status.
export async function updateOrderStatus(tx: Tx, u: OrderUpdate): Promise<OrderRow | null> {
  const params: unknown[] = [u.orderId, u.from, u.to];
  const sets = ["status = $3", "updated_at = now()"];
  if (u.setCourierId !== undefined) {
    params.push(u.setCourierId);
    sets.push(`assigned_courier_id = $${params.length}`);
  }
  if (u.setReadyAt) sets.push("ready_at = now()");
  if (u.setDeliveredAt) sets.push("delivered_at = now()");
  if (u.setReturnPending) sets.push("return_pending = true");
  const res = await tx.query<OrderRow>(
    `UPDATE orders SET ${sets.join(", ")} WHERE id = $1 AND status = $2 RETURNING ${ORDER_COLUMNS}`,
    params,
  );
  return res.rows[0] ?? null;
}

export interface TransitionRecord {
  orderId: string;
  branchId: string;
  from: OrderStatus;
  to: OrderStatus;
  actorId: string | null;
  actorRole: string;
  clientTs?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  reason: string | null;
  idempotencyKey?: string;
}

export async function insertTransition(tx: Tx, r: TransitionRecord): Promise<void> {
  await tx.query(
    `INSERT INTO order_state_transitions
       (order_id, branch_id, from_status, to_status, actor_id, actor_role, client_ts, lat, lng, accuracy, reason, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      r.orderId,
      r.branchId,
      r.from,
      r.to,
      r.actorId,
      r.actorRole,
      r.clientTs ?? null,
      r.lat ?? null,
      r.lng ?? null,
      r.accuracy ?? null,
      r.reason,
      r.idempotencyKey ?? null,
    ],
  );
}

export async function insertOutboxEvent(
  tx: Tx,
  e: { aggregateId: string; branchId: string; eventType: string; payload: unknown },
): Promise<void> {
  await tx.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, event_version, payload, branch_id)
     VALUES ('order', $1, $2, 1, $3, $4)`,
    [e.aggregateId, e.eventType, JSON.stringify(e.payload), e.branchId],
  );
}
