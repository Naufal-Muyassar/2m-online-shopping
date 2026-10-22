import { FAILED_REASONS, findTransition, type Actor, type OrderStatus } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { audit } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import * as repo from "./repo";

export interface TransitionActor {
  id: string | null;
  role: Actor;
}

export interface TransitionMeta {
  lat?: number;
  lng?: number;
  accuracy?: number;
  client_ts?: string;
  reason?: string;
  note?: string;
  courier_id?: string;
  idempotency_key?: string;
}

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  actor: TransitionActor;
  meta?: TransitionMeta;
}

const isCoord = (v: unknown, limit: number): boolean => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
const hasText = (v: string | undefined): v is string => typeof v === "string" && v.trim().length > 0;

export async function transition(
  tx: Tx,
  { orderId, to, actor, meta = {} }: TransitionInput,
): Promise<{ order: repo.OrderRow; replayed: boolean }> {
  const order = await repo.lockOrder(tx, orderId);
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

  if (meta.idempotency_key && (await repo.transitionKeyExists(tx, orderId, meta.idempotency_key))) {
    return { order, replayed: true };
  }

  const from = order.status;
  const rule = findTransition(from, to);
  if (!rule) throw new AppError(409, "INVALID_TRANSITION", `Cannot move order from ${from} to ${to}`);
  if (!rule.actors.includes(actor.role)) {
    throw new AppError(403, "FORBIDDEN", `Role ${actor.role} may not move order from ${from} to ${to}`);
  }
  if (actor.role === "courier" && order.assigned_courier_id !== actor.id) {
    throw new AppError(403, "FORBIDDEN", "Order is not assigned to this courier");
  }

  const missing: string[] = [];
  const hasProof = rule.requires.includes("proof") || rule.requires.includes("proof_or_note") ? await repo.hasProof(tx, orderId) : false;
  for (const req of rule.requires) {
    if (req === "reason" && !hasText(meta.reason)) missing.push("reason");
    if (req === "courier_id" && !meta.courier_id) missing.push("courier_id");
    if (req === "lat" && !isCoord(meta.lat, 90)) missing.push("lat");
    if (req === "lng" && !isCoord(meta.lng, 180)) missing.push("lng");
    if (req === "proof_or_note" && !hasProof && !hasText(meta.note)) missing.push("proof_or_note");
  }
  if (missing.length > 0) throw new AppError(400, "VALIDATION_ERROR", "Missing required transition data", { missing });
  if (to === "FAILED" && !(FAILED_REASONS as readonly string[]).includes(meta.reason ?? "")) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid failed reason", { allowed: FAILED_REASONS });
  }
  if (rule.requires.includes("proof") && !hasProof) {
    throw new AppError(409, "PROOF_REQUIRED", "Photo proof must be registered first");
  }
  if (meta.courier_id && !(await repo.courierInBranch(tx, meta.courier_id, order.branch_id))) {
    throw new AppError(400, "VALIDATION_ERROR", "Courier does not belong to the order's branch", {
      missing: ["courier_id"],
    });
  }

  const updated = await repo.updateOrderStatus(tx, {
    orderId,
    from,
    to,
    setCourierId: to === "ASSIGNED" ? meta.courier_id : from === "ASSIGNED" && to === "READY" ? null : undefined,
    setReadyAt: to === "READY" && from === "PICKING",
    setDeliveredAt: to === "DELIVERED",
    setReturnPending: to === "FAILED",
  });
  if (!updated) throw new AppError(409, "CONFLICT", "Order status changed concurrently");

  const reason = to === "FAILED" && hasText(meta.note) ? `${meta.reason}: ${meta.note}` : (meta.reason ?? null);
  await repo.insertTransition(tx, {
    orderId,
    branchId: order.branch_id,
    from,
    to,
    actorId: actor.id,
    actorRole: actor.role,
    clientTs: meta.client_ts,
    lat: meta.lat,
    lng: meta.lng,
    accuracy: meta.accuracy,
    reason,
    idempotencyKey: meta.idempotency_key,
  });
  await repo.insertOutboxEvent(tx, {
    aggregateId: orderId,
    branchId: order.branch_id,
    eventType: "STATUS_CHANGED",
    payload: { order_id: orderId, from, to, actor: { id: actor.id, role: actor.role }, branch_id: order.branch_id },
  });

  const action = auditAction(from, to, actor.role);
  if (action) {
    await audit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      branchId: order.branch_id,
      action,
      entityType: "order",
      entityId: orderId,
      before: { status: from },
      after: { status: to, reason, courier_id: order.assigned_courier_id },
    });
  }

  return { order: updated, replayed: false };
}

function auditAction(from: OrderStatus, to: OrderStatus, role: Actor): string | null {
  if (from === "PENDING_PAYMENT" && to === "PAID" && role === "super_admin") return "ORDER_FORCE_PAID";
  if (from === "ASSIGNED" && to === "READY") return "ORDER_REASSIGN";
  if (to === "CANCELLED" && (role === "branch_admin" || role === "super_admin")) return "ORDER_CANCEL";
  return null;
}
