import { withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { lockOrder } from "../orders/repo";
import { transition } from "../orders/service";
import { setCourierStatus } from "../courier/repo";
import * as repo from "./repo";

// Lock order is always order → courier, so concurrent assignments cannot deadlock.
async function assignFifo(tx: Tx, orderId: string, branchId: string): Promise<string | null> {
  const courierId = await repo.pickIdleCourier(tx, branchId);
  if (!courierId) return null;
  await transition(tx, {
    orderId,
    to: "ASSIGNED",
    actor: { id: null, role: "system" },
    meta: { courier_id: courierId },
  });
  await setCourierStatus(tx, courierId, "DELIVERING");
  return courierId;
}

export async function tryAssign(orderId: string): Promise<string | null> {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order || order.status !== "READY") return null;
    return assignFifo(tx, orderId, order.branch_id);
  });
}

// Assigns the oldest READY orders to idle couriers until one side runs out; returns how many were assigned.
export async function drainBranch(branchId: string): Promise<number> {
  let assigned = 0;
  for (;;) {
    const ok = await withTransaction(async (tx) => {
      const orderId = await repo.lockOldestReadyOrder(tx, branchId);
      if (!orderId) return false;
      return (await assignFifo(tx, orderId, branchId)) !== null;
    });
    if (!ok) return assigned;
    assigned++;
  }
}

export async function reassign(input: {
  orderId: string;
  adminId: string;
  branchId: string;
  courierId?: string;
  idempotencyKey?: string;
}) {
  const admin = { id: input.adminId, role: "branch_admin" as const };
  const result = await withTransaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    // Out-of-branch orders look nonexistent.
    if (!order || order.branch_id !== input.branchId) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

    const released = await transition(tx, {
      orderId: input.orderId,
      to: "READY",
      actor: admin,
      meta: { idempotency_key: input.idempotencyKey },
    });
    if (released.replayed) return released;

    if (order.assigned_courier_id) await setCourierStatus(tx, order.assigned_courier_id, "IDLE");
    if (!input.courierId) return released;

    if (!(await repo.lockIdleCourier(tx, input.courierId, input.branchId))) {
      throw new AppError(409, "COURIER_UNAVAILABLE", "Courier is not idle in this branch");
    }
    const assigned = await transition(tx, {
      orderId: input.orderId,
      to: "ASSIGNED",
      actor: admin,
      meta: { courier_id: input.courierId },
    });
    await setCourierStatus(tx, input.courierId, "DELIVERING");
    return assigned;
  });
  if (!result.replayed) await drainBranch(input.branchId);
  return result;
}
