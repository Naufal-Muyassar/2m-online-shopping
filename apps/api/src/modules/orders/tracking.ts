import { deliveryRouteSchema, trackingResponseSchema, TRACKING_STALE_SEC, type DeliveryRoute, type TrackingResponse } from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { deliveryRoute } from "../routing/service";

export { estimateEtaMinutes } from "../routing/service";

interface Position {
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: Date;
  age_sec: number;
}

// Latest ping on this order, else the courier's last known position (pings sent before the order was linked).
export async function lastCourierPosition(orderId: string, courierId: string | null): Promise<Position | undefined> {
  const pos = (
    await pool.query<Position>(
      `SELECT lat, lng, accuracy, server_ts AS updated_at, EXTRACT(EPOCH FROM now() - server_ts)::float8 AS age_sec
       FROM courier_pings WHERE order_id = $1 ORDER BY server_ts DESC, id DESC LIMIT 1`,
      [orderId],
    )
  ).rows[0];
  if (pos || !courierId) return pos;
  return (
    await pool.query<Position>(
      `SELECT current_lat AS lat, current_lng AS lng, NULL::float8 AS accuracy, last_ping_at AS updated_at,
              EXTRACT(EPOCH FROM now() - last_ping_at)::float8 AS age_sec
       FROM couriers WHERE user_id = $1 AND current_lat IS NOT NULL AND current_lng IS NOT NULL AND last_ping_at IS NOT NULL`,
      [courierId],
    )
  ).rows[0];
}

export async function getTracking(userId: string, orderId: string): Promise<TrackingResponse> {
  const orderRes = await pool.query<{
    status: string;
    assigned_courier_id: string | null;
    lat: number;
    lng: number;
    circuity_factor: number;
  }>(
    `SELECT o.status, o.assigned_courier_id, a.lat, a.lng, COALESCE(p.circuity_factor, 1.3)::float8 AS circuity_factor
     FROM orders o
     JOIN addresses a ON a.id = o.address_id
     LEFT JOIN branch_pricing_config p ON p.branch_id = o.branch_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, userId],
  );
  const o = orderRes.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  if (o.status !== "ON_DELIVERY") return trackingResponseSchema.parse({ active: false, status: o.status });

  const pos = await lastCourierPosition(orderId, o.assigned_courier_id);
  const route = await deliveryRoute({ orderId, from: pos ?? null, to: { lat: o.lat, lng: o.lng }, circuityFactor: o.circuity_factor });
  return trackingResponseSchema.parse({
    active: true,
    courier: pos
      ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, updated_at: pos.updated_at.toISOString() }
      : null,
    destination: { lat: o.lat, lng: o.lng },
    distance_remaining_km: route.distance_km,
    eta_minutes: route.eta_minutes,
    route_path: route.path,
    distance_source: route.source,
    stale: pos ? pos.age_sec > TRACKING_STALE_SEC : false,
  });
}

const ROUTED_STATUSES = new Set(["PICKING", "ON_DELIVERY"]);
const NO_ROUTE: DeliveryRoute = { path: null, distance_km: null, eta_minutes: null, source: "estimate" };

// Courier → destination for the courier app and the admin live board. Scoped by the caller: the courier must hold the
// order, the admin must own its branch. Same numbers as the customer tracking, from the same stored route.
async function orderRoute(orderId: string, scope: { courierId: string } | { branchId: string }): Promise<DeliveryRoute> {
  const byCourier = "courierId" in scope;
  const res = await pool.query<{ status: string; assigned_courier_id: string | null; lat: number; lng: number; circuity_factor: number }>(
    `SELECT o.status, o.assigned_courier_id, a.lat, a.lng, COALESCE(p.circuity_factor, 1.3)::float8 AS circuity_factor
     FROM orders o
     JOIN addresses a ON a.id = o.address_id
     LEFT JOIN branch_pricing_config p ON p.branch_id = o.branch_id
     WHERE o.id = $1 AND ${byCourier ? "o.assigned_courier_id" : "o.branch_id"} = $2`,
    [orderId, byCourier ? scope.courierId : scope.branchId],
  );
  const o = res.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  if (!ROUTED_STATUSES.has(o.status) || !o.assigned_courier_id) return NO_ROUTE;
  const pos = await lastCourierPosition(orderId, o.assigned_courier_id);
  return deliveryRouteSchema.parse(
    await deliveryRoute({ orderId, from: pos ?? null, to: { lat: o.lat, lng: o.lng }, circuityFactor: o.circuity_factor }),
  );
}

export const courierOrderRoute = (courierId: string, orderId: string) => orderRoute(orderId, { courierId });
export const adminOrderRoute = (branchId: string, orderId: string) => orderRoute(orderId, { branchId });
