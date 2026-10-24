import type { OrderStatus } from "@2m/shared";
import { pool, withTransaction } from "../../shared/db";
import { audit } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { clearReturnPending, getOrderBranch, lockOrder } from "../orders/repo";
import { transition } from "../orders/service";
import { setCourierStatus } from "../courier/repo";
import * as repo from "./repo";

export async function boardOrders(branchId: string) {
  return { orders: await repo.listBoardOrders(pool, branchId) };
}

export async function branchCouriers(branchId: string) {
  return { couriers: await repo.listBranchCouriers(pool, branchId) };
}

export async function confirmReturn(input: { orderId: string; adminId: string; branchId: string }) {
  await withTransaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order || order.branch_id !== input.branchId) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "FAILED" || !order.return_pending) {
      throw new AppError(409, "RETURN_NOT_PENDING", "Order has no pending return");
    }
    await clearReturnPending(tx, input.orderId);
    if (order.assigned_courier_id) await setCourierStatus(tx, order.assigned_courier_id, "IDLE");
    await audit(tx, {
      actorId: input.adminId,
      actorRole: "branch_admin",
      branchId: order.branch_id,
      action: "ORDER_RETURN_CONFIRMED",
      entityType: "order",
      entityId: input.orderId,
      before: { return_pending: true },
      after: { return_pending: false, courier_id: order.assigned_courier_id },
    });
  });
  return { order_id: input.orderId };
}

export async function adminTransition(input: {
  orderId: string;
  to: Extract<OrderStatus, "ACCEPTED">;
  adminId: string;
  branchId: string;
  idempotencyKey?: string;
}) {
  // Out-of-branch orders look nonexistent.
  if ((await getOrderBranch(pool, input.orderId)) !== input.branchId) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return withTransaction((tx) =>
    transition(tx, {
      orderId: input.orderId,
      to: input.to,
      actor: { id: input.adminId, role: "branch_admin" },
      meta: { idempotency_key: input.idempotencyKey },
    }),
  );
}

export async function assignOrder(input: {
  orderId: string;
  courierId: string;
  adminId: string;
  branchId: string;
  idempotencyKey?: string;
}) {
  if ((await getOrderBranch(pool, input.orderId)) !== input.branchId) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return withTransaction((tx) =>
    transition(tx, {
      orderId: input.orderId,
      to: "PICKING",
      actor: { id: input.adminId, role: "branch_admin" },
      meta: { courier_id: input.courierId, idempotency_key: input.idempotencyKey },
    }),
  );
}

export async function releaseOrder(input: {
  orderId: string;
  reason: string;
  adminId: string;
  branchId: string;
  idempotencyKey?: string;
}) {
  if ((await getOrderBranch(pool, input.orderId)) !== input.branchId) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return withTransaction((tx) =>
    transition(tx, {
      orderId: input.orderId,
      to: "ACCEPTED",
      actor: { id: input.adminId, role: "branch_admin" },
      meta: { reason: input.reason, idempotency_key: input.idempotencyKey },
    }),
  );
}

// DEMO: stands in for the payment gateway until payments exist.
export async function forcePaid(input: { orderId: string; adminId: string; idempotencyKey?: string }) {
  return withTransaction((tx) =>
    transition(tx, {
      orderId: input.orderId,
      to: "PAID",
      actor: { id: input.adminId, role: "super_admin" },
      meta: { idempotency_key: input.idempotencyKey },
    }),
  );
}
