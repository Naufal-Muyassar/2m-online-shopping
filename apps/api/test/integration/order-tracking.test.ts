import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { env } from "../../src/config/env";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { adminOrderRoute, courierOrderRoute, getTracking } from "../../src/modules/orders/tracking";

let fx: Fixture;
let otherCustomerId: string;

const FORBIDDEN_KEYS = ["courier_id", "partner_id", "phone", "receiver_phone", "battery", "client_ts", "pings", "user_id", "actor_id"];

function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

// The fixture destination is (-6.2, 106.8) and the branch circuity_factor is the default 1.3.
async function addPing(orderId: string, lat: number, lng: number, ageSec = 0) {
  await pool.query(
    `INSERT INTO courier_pings (courier_id, branch_id, order_id, lat, lng, accuracy, battery, client_ts, server_ts)
     VALUES ($1, $2, $3, $4, $5, 12, 80, now(), now() - make_interval(secs => $6))`,
    [fx.courierId, fx.branchId, orderId, lat, lng, ageSec],
  );
}

beforeAll(async () => {
  fx = await createFixture(pool);
  const tag = randomUUID().slice(0, 8);
  otherCustomerId = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('customer', $1, $2, 'x') RETURNING id`,
      [`other-${tag}`, `t-other-${tag}`],
    )
  ).rows[0].id as string;
});

afterAll(async () => {
  await closeRedis();
  await pool.end();
});

describe("order tracking", () => {
  it("is owner-only", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await expect(getTracking(otherCustomerId, id)).rejects.toMatchObject({ status: 404 });
    await expect(getTracking(fx.users.customer, randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("is inactive before ON_DELIVERY and after DELIVERED", async () => {
    const paid = await insertOrder(pool, fx, "PAID");
    expect(await getTracking(fx.users.customer, paid)).toEqual({ active: false, status: "PAID" });

    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.19, 106.8);
    expect((await getTracking(fx.users.customer, id)).active).toBe(true);
    await pool.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [id]);
    expect(await getTracking(fx.users.customer, id)).toEqual({ active: false, status: "DELIVERED" });
  });

  it("computes distance and ETA from the latest ping and the branch circuity factor", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.0, 106.8, 30);
    await addPing(id, -6.19, 106.8, 5);
    const t = await getTracking(fx.users.customer, id);
    expect(t.active).toBe(true);
    if (!t.active) return;
    expect(t.courier).toMatchObject({ lat: -6.19, lng: 106.8, accuracy: 12 });
    expect(t.destination).toEqual({ lat: -6.2, lng: 106.8 });
    // 0.01 deg of latitude is about 1.112 km straight; x1.3 circuity.
    expect(t.distance_remaining_km).toBe(1.45);
    expect(t.eta_minutes).toBe(Math.max(1, Math.ceil((1.45 / env.TRACKING_AVG_SPEED_KMH) * 60)));
    // Tests run with routing off, so this is the straight-line estimate with no road geometry.
    expect(t.distance_source).toBe("estimate");
    expect(t.route_path).toBeNull();
    expect(t.stale).toBe(false);
  });

  it("uses a minimum ETA of 1 minute at the destination", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.2, 106.8);
    const t = await getTracking(fx.users.customer, id);
    expect(t.active && t.distance_remaining_km).toBe(0);
    expect(t.active && t.eta_minutes).toBe(1);
  });

  it("flags a ping older than 60 s as stale", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.19, 106.8, 120);
    const t = await getTracking(fx.users.customer, id);
    expect(t.active && t.stale).toBe(true);
  });

  it("falls back to the courier's current position, then to a null courier", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await pool.query(`UPDATE couriers SET current_lat = NULL, current_lng = NULL, last_ping_at = NULL WHERE user_id = $1`, [fx.courierId]);
    const none = await getTracking(fx.users.customer, id);
    expect(none).toMatchObject({ active: true, courier: null, distance_remaining_km: null, eta_minutes: null, stale: false });

    await pool.query(`UPDATE couriers SET current_lat = -6.19, current_lng = 106.8, last_ping_at = now() WHERE user_id = $1`, [fx.courierId]);
    const fallback = await getTracking(fx.users.customer, id);
    expect(fallback.active && fallback.courier).toMatchObject({ lat: -6.19, lng: 106.8, accuracy: null });
    expect(fallback.active && fallback.distance_remaining_km).toBe(1.45);
  });

  it("exposes no courier identity, phone or ping history", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.19, 106.8);
    await addPing(id, -6.195, 106.8, 10);
    const keys = allKeys(JSON.parse(JSON.stringify(await getTracking(fx.users.customer, id))));
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
    expect([...keys].sort()).toEqual(
      [
        "accuracy",
        "active",
        "courier",
        "destination",
        "distance_remaining_km",
        "distance_source",
        "eta_minutes",
        "lat",
        "lng",
        "route_path",
        "stale",
        "updated_at",
      ].sort(),
    );
  });
});

describe("order route for the courier and the admin", () => {
  it("gives the holding courier and the branch the same numbers as the customer", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await addPing(id, -6.19, 106.8);
    const expected = {
      path: null,
      distance_km: 1.45,
      eta_minutes: Math.max(1, Math.ceil((1.45 / env.TRACKING_AVG_SPEED_KMH) * 60)),
      source: "estimate",
      origin: "courier",
    };
    expect(await courierOrderRoute(fx.courierId, id)).toEqual(expected);
    expect(await adminOrderRoute(fx.branchId, id)).toEqual(expected);
  });

  it("is scoped to the courier holding the order and to its branch", async () => {
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await expect(courierOrderRoute(randomUUID(), id)).rejects.toMatchObject({ status: 404 });
    await expect(adminOrderRoute(randomUUID(), id)).rejects.toMatchObject({ status: 404 });
  });

  it("routes the admin board from the branch until a courier is on the way", async () => {
    // The fixture branch is 0.01° south of the destination: ~1.112 km straight, x1.3 circuity.
    await pool.query(`UPDATE branches SET lat = -6.19 WHERE id = $1`, [fx.branchId]);
    try {
      const id = await insertOrder(pool, fx, "PAID");
      expect(await adminOrderRoute(fx.branchId, id)).toMatchObject({ origin: "branch", source: "estimate", distance_km: 1.45 });
    } finally {
      await pool.query(`UPDATE branches SET lat = -6.2 WHERE id = $1`, [fx.branchId]);
    }
  });

  it("routes the courier app only from the courier's own position", async () => {
    const id = await insertOrder(pool, fx, "PICKING");
    await pool.query(`UPDATE couriers SET current_lat = NULL, current_lng = NULL, last_ping_at = NULL WHERE user_id = $1`, [fx.courierId]);
    const none = { path: null, distance_km: null, eta_minutes: null, source: "estimate", origin: null };
    expect(await courierOrderRoute(fx.courierId, id)).toEqual(none);
    expect((await adminOrderRoute(fx.branchId, id)).origin).toBe("branch");
  });

  it("has no route once the order is finished", async () => {
    const id = await insertOrder(pool, fx, "DELIVERED");
    expect(await adminOrderRoute(fx.branchId, id)).toEqual({ path: null, distance_km: null, eta_minutes: null, source: "estimate", origin: null });
  });
});
