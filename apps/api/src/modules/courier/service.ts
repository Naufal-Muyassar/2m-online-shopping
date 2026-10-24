import type {
  CourierClaimRequest,
  CourierJobsResponse,
  CourierReleaseRequest,
  CourierStatusRequest,
  CourierOrderStatusRequest,
  PickItemRequest,
  PingsRequest,
  ProofRegisterRequest,
} from "@2m/shared";
import { pool, withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { isProofKeyFor, presignPut, proofKeyFor } from "../../shared/storage";
import { lockOrder, transitionKeyExists } from "../orders/repo";
import { transition } from "../orders/service";
import * as repo from "./repo";

async function requireCourier(courierId: string): Promise<repo.CourierRow> {
  const courier = await repo.getCourier(pool, courierId);
  if (!courier) throw new AppError(404, "COURIER_NOT_FOUND", "Courier profile not found");
  return courier;
}

export async function me(courierId: string) {
  const c = await requireCourier(courierId);
  return {
    ...c,
    last_status_change: c.last_status_change.toISOString(),
    last_ping_at: c.last_ping_at?.toISOString() ?? null,
  };
}

export async function setStatus(courierId: string, status: CourierStatusRequest["status"]) {
  await withTransaction(async (tx) => {
    const c = await repo.getCourier(tx, courierId, true);
    if (!c) throw new AppError(404, "COURIER_NOT_FOUND", "Courier profile not found");
    if (c.status === "DELIVERING") throw new AppError(409, "COURIER_BUSY", "Cannot change status while delivering");
    await repo.setCourierStatus(tx, courierId, status);
  });
  return { status };
}

export async function listJobs(courierId: string): Promise<CourierJobsResponse> {
  const courier = await requireCourier(courierId);
  if (courier.status !== "IDLE") {
    return { jobs: [], can_claim: false, reason: courier.status === "OFFLINE" ? "OFFLINE" : "BUSY" };
  }
  return { jobs: await repo.listJobs(pool, courier.branch_id), can_claim: true };
}

export async function claimJob(courierId: string, orderId: string, body: CourierClaimRequest) {
  const courier = await requireCourier(courierId);
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    // Out-of-branch jobs look nonexistent.
    if (!order || order.branch_id !== courier.branch_id) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "ACCEPTED" && !(await transitionKeyExists(tx, orderId, body.idempotency_key))) {
      throw new AppError(409, "JOB_TAKEN", "Order is no longer available");
    }
    await transition(tx, {
      orderId,
      to: "PICKING",
      actor: { id: courierId, role: "courier" },
      meta: { lat: body.lat, lng: body.lng, accuracy: body.accuracy, client_ts: body.client_ts, idempotency_key: body.idempotency_key },
    });
    return (await repo.getCourierOrder(tx, courierId, orderId))!;
  });
}

export async function pickItem(courierId: string, orderId: string, itemId: string, body: PickItemRequest) {
  return withTransaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order || order.assigned_courier_id !== courierId) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "PICKING") throw new AppError(409, "INVALID_STATE", "Order is not being picked");
    const qty = await repo.getItemQty(tx, orderId, itemId);
    if (qty === null) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found");
    if (body.picked_qty > qty) {
      throw new AppError(400, "VALIDATION_ERROR", "picked_qty exceeds ordered qty", { max: qty });
    }
    await repo.setPickedQty(tx, itemId, body.picked_qty);
    return { id: itemId, picked_qty: body.picked_qty };
  });
}

export async function releaseOrder(courierId: string, orderId: string, body: CourierReleaseRequest) {
  return withTransaction((tx) =>
    transition(tx, {
      orderId,
      to: "ACCEPTED",
      actor: { id: courierId, role: "courier" },
      meta: { reason: body.reason },
    }),
  );
}

export async function listOrders(courierId: string) {
  const [active, recent] = await Promise.all([repo.listActiveOrders(pool, courierId), repo.listRecentOrders(pool, courierId)]);
  return { active, recent };
}

export async function getOrder(courierId: string, orderId: string) {
  const order = await repo.getCourierOrder(pool, courierId, orderId);
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  return order;
}

export async function updateOrderStatus(courierId: string, orderId: string, body: CourierOrderStatusRequest) {
  const result = await withTransaction(async (tx) => {
    const r = await transition(tx, {
      orderId,
      to: body.to,
      actor: { id: courierId, role: "courier" },
      meta: {
        lat: body.lat,
        lng: body.lng,
        accuracy: body.accuracy,
        client_ts: body.client_ts,
        reason: body.reason,
        note: body.note,
        idempotency_key: body.idempotency_key,
      },
    });
    if (!r.replayed && body.to === "DELIVERED" && !r.order.return_pending) {
      await repo.setCourierStatus(tx, courierId, "IDLE");
    }
    return r;
  });
  return result;
}

async function requireOnDelivery(courierId: string, orderId: string) {
  const order = await repo.getAssignedOrder(pool, courierId, orderId);
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  if (order.status !== "ON_DELIVERY") throw new AppError(409, "INVALID_STATE", "Order is not on delivery");
  return order;
}

export async function proofUploadUrl(courierId: string, orderId: string) {
  await requireOnDelivery(courierId, orderId);
  const photoKey = proofKeyFor(orderId);
  return { upload_url: await presignPut(photoKey), photo_key: photoKey };
}

export async function registerProof(courierId: string, orderId: string, body: ProofRegisterRequest) {
  const order = await requireOnDelivery(courierId, orderId);
  if (!isProofKeyFor(orderId, body.photo_key)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid photo_key for this order", { missing: ["photo_key"] });
  }
  await withTransaction((tx) =>
    repo.upsertProof(tx, { orderId, branchId: order.branch_id, photoKey: body.photo_key, lat: body.lat, lng: body.lng }),
  );
  return { photo_key: body.photo_key };
}

export async function recordPings(courierId: string, body: PingsRequest) {
  const courier = await requireCourier(courierId);
  const latest = body.pings.reduce((a, b) => (Date.parse(b.client_ts) > Date.parse(a.client_ts) ? b : a));
  await withTransaction(async (tx) => {
    await repo.insertPings(tx, courierId, courier.branch_id, body.pings);
    await repo.touchCourierLocation(tx, courierId, latest.lat, latest.lng);
  });
  return { accepted: body.pings.length };
}
