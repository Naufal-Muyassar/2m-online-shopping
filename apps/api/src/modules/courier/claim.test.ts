import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { transition } from "../orders/service";
import { createFixture, insertOrder, type Fixture } from "../orders/test-fixtures";
import { claimJob, pickItem } from "./service";

afterAll(async () => {
  await pool.end();
});

const claimBody = () => ({
  lat: -6.2,
  lng: 106.8,
  accuracy: 10,
  client_ts: new Date().toISOString(),
  idempotency_key: randomUUID(),
});

async function addCourier(fx: Fixture): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const partner = (await pool.query(`SELECT partner_id FROM couriers WHERE user_id = $1`, [fx.courierId])).rows[0]
    .partner_id as string;
  const id = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash, branch_id) VALUES ('courier', $1, $2, 'x', $3) RETURNING id`,
      [`courier-${tag}`, `t-courier-${tag}`, fx.branchId],
    )
  ).rows[0].id as string;
  await pool.query(`INSERT INTO couriers (user_id, partner_id, branch_id, status) VALUES ($1,$2,$3,'IDLE')`, [
    id,
    partner,
    fx.branchId,
  ]);
  return id;
}

async function addItem(fx: Fixture, orderId: string, qty: number): Promise<string> {
  const sku = `T-${randomUUID().slice(0, 8)}`;
  const productId = (
    await pool.query(
      `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $1, 'pcs', 'test', 1) RETURNING id`,
      [sku],
    )
  ).rows[0].id as string;
  return (
    await pool.query(
      `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg)
       VALUES ($1,$2,$3,$4,$4,$5,1000,1) RETURNING id`,
      [orderId, fx.branchId, productId, sku, qty],
    )
  ).rows[0].id as string;
}

describe("job claim", () => {
  it("lets exactly one of 10 concurrent couriers claim an ACCEPTED order", async () => {
    const fx = await createFixture(pool);
    const courierIds = [fx.courierId];
    for (let i = 0; i < 9; i++) courierIds.push(await addCourier(fx));
    const orderId = await insertOrder(pool, fx, "ACCEPTED");

    const results = await Promise.allSettled(courierIds.map((id) => claimJob(id, orderId, claimBody())));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    expect(lost.every((r) => (r.reason as AppError).code === "JOB_TAKEN")).toBe(true);

    const delivering = await pool.query(
      `SELECT count(*)::int AS n FROM couriers WHERE user_id = ANY($1::uuid[]) AND status = 'DELIVERING'`,
      [courierIds],
    );
    expect(delivering.rows[0].n).toBe(1);
    const order = (await pool.query(`SELECT status, assigned_courier_id FROM orders WHERE id = $1`, [orderId])).rows[0];
    expect(order.status).toBe("PICKING");
    expect(courierIds).toContain(order.assigned_courier_id);
  });

  it("rejects a claim from a courier that is already DELIVERING", async () => {
    const fx = await createFixture(pool);
    await pool.query(`UPDATE couriers SET status = 'DELIVERING' WHERE user_id = $1`, [fx.courierId]);
    const orderId = await insertOrder(pool, fx, "ACCEPTED");

    await expect(claimJob(fx.courierId, orderId, claimBody())).rejects.toMatchObject({ code: "COURIER_BUSY" });
    const order = (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0];
    expect(order.status).toBe("ACCEPTED");
  });
});

describe("picking", () => {
  it("blocks PICKING → ON_DELIVERY until every item is picked", async () => {
    const fx = await createFixture(pool);
    const orderId = await insertOrder(pool, fx, "PICKING");
    const itemId = await addItem(fx, orderId, 2);
    const toOnDelivery = () =>
      withTransaction((tx) =>
        transition(tx, {
          orderId,
          to: "ON_DELIVERY",
          actor: { id: fx.courierId, role: "courier" },
          meta: { lat: -6.2, lng: 106.8, client_ts: new Date().toISOString() },
        }),
      );

    await expect(toOnDelivery()).rejects.toMatchObject({ code: "PICKING_INCOMPLETE" });

    await pickItem(fx.courierId, orderId, itemId, { picked_qty: 1 });
    await expect(toOnDelivery()).rejects.toMatchObject({ code: "PICKING_INCOMPLETE" });

    await pickItem(fx.courierId, orderId, itemId, { picked_qty: 2 });
    const { order } = await toOnDelivery();
    expect(order.status).toBe("ON_DELIVERY");
  });
});
