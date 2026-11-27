import bcrypt from "bcryptjs";
import type { CreateCourierRequest, OrderStatus } from "@2m/shared";
import { pool, withTransaction } from "../../shared/db";
import { audit } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { clearReturnPending, getOrderBranch, lockOrder } from "../orders/repo";
import { transition } from "../orders/service";
import { setCourierStatus } from "../courier/repo";
import * as repo from "./repo";

export async function boardOrders(branchId: string, date?: string) {
  return { orders: await repo.listBoardOrders(pool, branchId, date) };
}

// The transition table decides which statuses each role may cancel; the worker gives the stock back.
export async function cancelOrder(input: {
  orderId: string;
  reason: string;
  actor: { id: string; role: "branch_admin" | "super_admin" };
  branchId: string;
  idempotencyKey?: string;
}) {
  if ((await getOrderBranch(pool, input.orderId)) !== input.branchId) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  return withTransaction((tx) =>
    transition(tx, {
      orderId: input.orderId,
      to: "CANCELLED",
      actor: input.actor,
      meta: { reason: input.reason, idempotency_key: input.idempotencyKey },
    }),
  );
}

export async function branchCouriers(branchId: string) {
  return { couriers: await repo.listBranchCouriers(pool, branchId) };
}

export async function courierPartners() {
  return { partners: await repo.listActivePartners(pool) };
}

export async function createCourier(input: {
  branchId: string;
  actor: { id: string; role: "branch_admin" | "super_admin" };
  body: CreateCourierRequest;
}) {
  const passwordHash = await bcrypt.hash(input.body.password, 10);
  return withTransaction(async (tx) => {
    if (!(await repo.partnerIsActive(tx, input.body.partner_id))) {
      throw new AppError(400, "VALIDATION_ERROR", "Unknown courier partner", { missing: ["partner_id"] });
    }
    let courier: Awaited<ReturnType<typeof repo.insertCourier>>;
    try {
      courier = await repo.insertCourier(tx, {
        branchId: input.branchId,
        partnerId: input.body.partner_id,
        name: input.body.name,
        phone: input.body.phone,
        passwordHash,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new AppError(409, "ACCOUNT_EXISTS", "Phone number is already registered");
      }
      throw err;
    }
    await audit(tx, {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      branchId: input.branchId,
      action: "COURIER_CREATED",
      entityType: "user",
      entityId: courier.user_id,
      after: { id: courier.user_id, role: "courier", branch_id: input.branchId, partner_id: input.body.partner_id },
    });
    return { courier };
  });
}

export async function courierReleases(courierId: string, branchId: string) {
  if (!(await repo.courierInBranch(pool, courierId, branchId))) throw new AppError(404, "NOT_FOUND", "Courier not found");
  return { releases: await repo.listCourierReleases(pool, courierId) };
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
