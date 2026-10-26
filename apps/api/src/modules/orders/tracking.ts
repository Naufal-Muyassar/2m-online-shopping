import { trackingResponseSchema, TRACKING_STALE_SEC, type TrackingResponse } from "@2m/shared";
import { env } from "../../config/env";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { haversineM } from "../../shared/geo";

interface Position {
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: Date;
  age_sec: number;
}

export function estimateEtaMinutes(distanceKm: number, speedKmh: number): number {
  return Math.max(1, Math.ceil((distanceKm / speedKmh) * 60));
}

export async function getTracking(userId: string, orderId: string): Promise<TrackingResponse> {
  const orderRes = await pool.query<{
    status: string;
    assigned_courier_id: string | null;
    lat: number;
    lng: number;
    circuity_factor: number;
  }>(
    `SELECT o.status, o.assigned_courier_id, a.lat, a.lng, b.circuity_factor::float8 AS circuity_factor
     FROM orders o
     JOIN addresses a ON a.id = o.address_id
     JOIN branches b ON b.id = o.branch_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, userId],
  );
  const o = orderRes.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  if (o.status !== "ON_DELIVERY") return trackingResponseSchema.parse({ active: false, status: o.status });

  let pos: Position | undefined = (
    await pool.query<Position>(
      `SELECT lat, lng, accuracy, server_ts AS updated_at, EXTRACT(EPOCH FROM now() - server_ts)::float8 AS age_sec
       FROM courier_pings WHERE order_id = $1 ORDER BY server_ts DESC, id DESC LIMIT 1`,
      [orderId],
    )
  ).rows[0];
  if (!pos && o.assigned_courier_id) {
    pos = (
      await pool.query<Position>(
        `SELECT current_lat AS lat, current_lng AS lng, NULL::float8 AS accuracy, last_ping_at AS updated_at,
                EXTRACT(EPOCH FROM now() - last_ping_at)::float8 AS age_sec
         FROM couriers WHERE user_id = $1 AND current_lat IS NOT NULL AND current_lng IS NOT NULL AND last_ping_at IS NOT NULL`,
        [o.assigned_courier_id],
      )
    ).rows[0];
  }

  const distanceKm = pos
    ? Math.round((haversineM(pos.lat, pos.lng, o.lat, o.lng) / 1000) * o.circuity_factor * 100) / 100
    : null;
  return trackingResponseSchema.parse({
    active: true,
    courier: pos
      ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, updated_at: pos.updated_at.toISOString() }
      : null,
    destination: { lat: o.lat, lng: o.lng },
    distance_remaining_km: distanceKm,
    eta_minutes: distanceKm === null ? null : estimateEtaMinutes(distanceKm, env.TRACKING_AVG_SPEED_KMH),
    stale: pos ? pos.age_sec > TRACKING_STALE_SEC : false,
  });
}
