import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { getCustomerOrder, listCustomerOrders } from "../../src/modules/orders/customer";

let fx: Fixture;
let otherCustomerId: string;
let productId: string;

const FORBIDDEN_KEYS = [
  "courier_wage",
  "courier_pay_final",
  "fee_floor",
  "fee_cap",
  "pricing_snapshot",
  "actor_id",
  "idempotency_key",
  "motor_cluster",
];

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

async function addTransition(orderId: string, from: string | null, to: string, opts: { reason?: string; at: string }) {
  await pool.query(
    `INSERT INTO order_state_transitions (order_id, branch_id, from_status, to_status, actor_id, actor_role, server_ts,
                                          lat, lng, reason, idempotency_key)
     VALUES ($1, $2, $3::order_status, $4::order_status, $5, 'courier', $6, -6.2, 106.8, $7, $8)`,
    [orderId, fx.branchId, from, to, fx.courierId, opts.at, opts.reason ?? null, randomUUID()],
  );
}

async function addItem(orderId: string) {
  await pool.query(
    `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg)
     VALUES ($1, $2, $3, 'S', 'Beras', 2, 5000, 1)`,
    [orderId, fx.branchId, productId],
  );
}

async function deliveredOrder(): Promise<string> {
  const id = await insertOrder(pool, fx, "DELIVERED");
  await pool.query(`UPDATE orders SET courier_wage = 7000, courier_pay_final = 7000, route_distance_km = 2.5, assigned_courier_id = $2 WHERE id = $1`, [id, fx.courierId]);
  await addItem(id);
  await pool.query(`UPDATE order_items SET picked_qty = NULL WHERE order_id = $1`, [id]);
  await addTransition(id, "PICKING", "ON_DELIVERY", { at: "2026-01-01T10:10:00Z" });
  await addTransition(id, null, "PENDING_PAYMENT", { at: "2026-01-01T10:00:00Z" });
  await addTransition(id, "PENDING_PAYMENT", "PAID", { at: "2026-01-01T10:05:00Z" });
  await addTransition(id, "ON_DELIVERY", "DELIVERED", { at: "2026-01-01T10:20:00Z" });
  await pool.query(
    `INSERT INTO proof_of_delivery (order_id, branch_id, photo_key, lat, lng, taken_at)
     VALUES ($1, $2, $3, -6.2, 106.8, '2026-01-01T10:19:00Z')`,
    [id, fx.branchId, `proofs/${id}/${randomUUID()}.jpg`],
  );
  return id;
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
  productId = (
    await pool.query(`INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, 'Beras', 'kg', 'test', 1) RETURNING id`, [
      `H-${tag}`,
    ])
  ).rows[0].id as string;
});

afterAll(async () => {
  await closeRedis();
  await pool.end();
});

describe("customer order detail", () => {
  it("answers 404 for another customer's order", async () => {
    const id = await insertOrder(pool, fx, "PAID");
    await expect(getCustomerOrder(otherCustomerId, id)).rejects.toMatchObject({ status: 404 });
    await expect(getCustomerOrder(fx.users.customer, randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it("exposes no internal keys and no coordinates in the timeline, with ascending timeline and proof", async () => {
    const id = await deliveredOrder();
    const detail = await getCustomerOrder(fx.users.customer, id);

    const keys = allKeys(JSON.parse(JSON.stringify(detail)));
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);

    for (const t of detail.timeline) expect(Object.keys(t).sort()).toEqual(["at", "status"]);
    expect(detail.timeline.map((t) => t.status)).toEqual(["PENDING_PAYMENT", "PAID", "ON_DELIVERY", "DELIVERED"]);
    const times = detail.timeline.map((t) => Date.parse(t.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));

    expect(detail.order.paid_at).toBe("2026-01-01T10:05:00.000Z");
    expect(detail.items[0]).toMatchObject({ unit: "kg", qty: 2, picked_qty: 0, unit_price: 5000, line_total: 10000 });
    expect(detail.pricing.route_distance_km).toBe(2.5);
    expect(detail.courier?.first_name).toMatch(/^courier-/);
    expect(detail.failure).toBeNull();
    expect(detail.tracking_available).toBe(false);
    expect(detail.proof?.taken_at).toBe("2026-01-01T10:19:00.000Z");
    expect(detail.proof?.photo_url).toMatch(/^http/);
    expect(Object.keys(detail.proof ?? {}).sort()).toEqual(["photo_url", "taken_at"]);
  });

  it("returns proof only for DELIVERED or FAILED and maps failure reasons to fixed labels", async () => {
    const onDelivery = await insertOrder(pool, fx, "ON_DELIVERY");
    const d1 = await getCustomerOrder(fx.users.customer, onDelivery);
    expect(d1.proof).toBeNull();
    expect(d1.tracking_available).toBe(true);

    const failed = await insertOrder(pool, fx, "FAILED");
    await addTransition(failed, "ON_DELIVERY", "FAILED", { at: "2026-01-01T11:00:00Z", reason: "ADDRESS_NOT_FOUND" });
    await pool.query(`INSERT INTO proof_of_delivery (order_id, branch_id, photo_key, lat, lng) VALUES ($1, $2, 'k.jpg', -6.2, 106.8)`, [failed, fx.branchId]);
    const d2 = await getCustomerOrder(fx.users.customer, failed);
    expect(d2.failure).toBe("Alamat tidak ditemukan");
    expect(d2.proof).not.toBeNull();

    const cancelled = await insertOrder(pool, fx, "CANCELLED");
    await addTransition(cancelled, "PAID", "CANCELLED", { at: "2026-01-01T11:00:00Z", reason: "stok habis, maaf ya" });
    const d3 = await getCustomerOrder(fx.users.customer, cancelled);
    expect(d3.failure).toBe("Pengantaran tidak berhasil");
    expect(JSON.stringify(d3)).not.toContain("stok habis");
    expect(d3.proof).toBeNull();
  });
});

describe("customer order list", () => {
  it("pages with a keyset cursor and returns each order exactly once", async () => {
    const ids: string[] = [];
    const sameTs = "2026-02-01T00:00:00.123456Z";
    for (const ts of [sameTs, sameTs, "2026-02-02T00:00:00Z", "2026-01-30T00:00:00Z", "2026-02-03T00:00:00Z"]) {
      const id = await insertOrder(pool, fx, "PAID");
      await pool.query(`UPDATE orders SET created_at = $2 WHERE id = $1`, [id, ts]);
      ids.push(id);
    }
    const total = (await pool.query(`SELECT count(*)::int AS n FROM orders WHERE customer_id = $1`, [fx.users.customer])).rows[0].n as number;

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listCustomerOrders(pool, fx.users.customer, { cursor, limit: 2 });
      expect(page.orders.length).toBeLessThanOrEqual(2);
      seen.push(...page.orders.map((o) => o.id));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    for (const id of ids) expect(seen).toContain(id);

    const first = await listCustomerOrders(pool, fx.users.customer, { limit: 50 });
    const stamps = first.orders.map((o) => Date.parse(o.created_at));
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    expect(await listCustomerOrders(pool, otherCustomerId, { limit: 20 })).toEqual({ orders: [], next_cursor: null });
    await expect(listCustomerOrders(pool, fx.users.customer, { cursor: "garbage", limit: 2 })).rejects.toMatchObject({
      code: "INVALID_CURSOR",
    });
  });
});
