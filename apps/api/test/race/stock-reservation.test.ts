import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { closeRedis, getRedis } from "../../src/shared/redis";
import { createFixture, giveStock, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as cart from "../../src/modules/cart/service";
import { createOrder } from "../../src/modules/orders/customer";
import { FakeProvider } from "../../src/modules/payments/fake-provider";
import { setPaymentProvider } from "../../src/modules/payments/registry";
import { handleXenditWebhook, reconcilePayments } from "../../src/modules/payments/service";
import { processBatch } from "../../src/modules/events/service";
import * as ordersRepo from "../../src/modules/orders/repo";
import { rebuildCounters, releaseOrder, setStock, sweepExpired } from "../../src/modules/inventory/service";
import { COUNTER_PATTERN, readCounter } from "../../src/modules/inventory/counters";
import { stockProvider } from "../../src/modules/catalog/stock";
// Importing the worker registers the outbox handlers (stock release / commit); it starts no loops.
import "../../src/worker";

let fx: Fixture;
let fake: FakeProvider;
let seq = 0;

const tag = randomUUID().slice(0, 8);

beforeAll(async () => {
  fx = await createFixture(pool);
  await pool.query(
    `INSERT INTO branch_pricing_config (branch_id, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order)
     VALUES ($1, 5000, 2000, 1, 20, 500, 6000, 30000, 20000)`,
    [fx.branchId],
  );
  await pool.query(
    `INSERT INTO branch_limits (branch_id, max_qty_per_sku_default, max_order_weight_kg, heavy_order_threshold_kg)
     VALUES ($1, 10, 100, 90)`,
    [fx.branchId],
  );
});

beforeEach(() => {
  fake = new FakeProvider();
  setPaymentProvider(fake);
});

afterAll(async () => {
  setPaymentProvider(null);
  await closeRedis();
  await pool.end();
});

async function newProduct(stock: number, price = 25000): Promise<string> {
  const id = (
    await pool.query(
      `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $1, 'pcs', 'test', 1) RETURNING id`,
      [`S-${tag}-${seq++}`],
    )
  ).rows[0].id as string;
  await pool.query(`INSERT INTO branch_products (branch_id, product_id, price) VALUES ($1, $2, $3)`, [fx.branchId, id, price]);
  await giveStock(pool, fx.branchId, id, stock);
  return id;
}

async function newCustomer(): Promise<{ userId: string; addressId: string }> {
  const n = seq++;
  const userId = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('customer', $1, $2, 'x') RETURNING id`,
      [`c-${tag}-${n}`, `t-c-${tag}-${n}`],
    )
  ).rows[0].id as string;
  const addressId = (
    await pool.query(
      `INSERT INTO addresses (user_id, label, lat, lng, street, receiver_name, receiver_phone)
       VALUES ($1, 'test', -6.205, 106.805, 'x', 'x', '0') RETURNING id`,
      [userId],
    )
  ).rows[0].id as string;
  return { userId, addressId };
}

type Customer = Awaited<ReturnType<typeof newCustomer>>;

const checkout = (c: Customer) =>
  createOrder(c.userId, { branch_id: fx.branchId, address_id: c.addressId, payment_method: "QRIS" });

async function buy(c: Customer, lines: [string, number][]) {
  for (const [productId, qty] of lines) await cart.addItem(c.userId, fx.branchId, productId, qty);
  return checkout(c);
}

async function drainOutbox(): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await processBatch()) === 0) return;
}

const reservationStatuses = async (orderId: string) =>
  (await pool.query(`SELECT status FROM stock_reservations WHERE order_id = $1 ORDER BY product_id`, [orderId])).rows.map((r) => r.status);

const pay = (inv: { id: string; externalId: string; amount: number }) =>
  handleXenditWebhook(JSON.stringify({ id: inv.id, external_id: inv.externalId, status: "PAID", amount: inv.amount }), {
    "x-callback-token": fake.callbackToken,
  });

describe("stock reservation", () => {
  it("lets exactly one of 50 parallel checkouts take the last unit", async () => {
    const productId = await newProduct(1);
    const customers = await Promise.all(Array.from({ length: 50 }, newCustomer));
    for (const c of customers) await cart.addItem(c.userId, fx.branchId, productId, 1);

    const results = await Promise.allSettled(customers.map(checkout));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(49);
    for (const r of lost) expect(r.reason).toMatchObject({ code: "OUT_OF_STOCK" });
    expect(Number((await pool.query(`SELECT count(*) AS n FROM stock_reservations WHERE product_id = $1`, [productId])).rows[0].n)).toBe(1);
    expect(await readCounter(fx.branchId, productId)).toBe(0);
  });

  it("adds stock back exactly once when PAYMENT_EXPIRED is handled three times", async () => {
    const productId = await newProduct(5);
    const order = await buy(await newCustomer(), [[productId, 2]]);
    expect(await readCounter(fx.branchId, productId)).toBe(3);

    fake.expire(fake.latest().id);
    await pool.query(`UPDATE orders SET created_at = now() - interval '25 minutes' WHERE id = $1`, [order.id]);
    await reconcilePayments();
    const orderRow = (await pool.query(`SELECT branch_id FROM orders WHERE id = $1`, [order.id])).rows[0];
    const client = await pool.connect();
    try {
      for (let i = 0; i < 2; i++) {
        await ordersRepo.insertOutboxEvent(client, {
          aggregateId: order.id,
          branchId: orderRow.branch_id,
          eventType: "PAYMENT_EXPIRED",
          payload: { order_id: order.id },
        });
      }
    } finally {
      client.release();
    }
    await drainOutbox();

    expect(await reservationStatuses(order.id)).toEqual(["RELEASED"]);
    expect(await readCounter(fx.branchId, productId)).toBe(5);
    expect(await releaseOrder(order.id)).toBe(0);
    expect(await readCounter(fx.branchId, productId)).toBe(5);
  });

  it("keeps active reservations when Redis is flushed and rebuilt", async () => {
    const productId = await newProduct(5);
    const order = await buy(await newCustomer(), [[productId, 2]]);

    const redis = getRedis();
    const keys = await redis.keys(COUNTER_PATTERN);
    if (keys.length > 0) await redis.del(...keys);
    expect(await readCounter(fx.branchId, productId)).toBeNull();
    await rebuildCounters();
    expect(await readCounter(fx.branchId, productId)).toBe(3);
    expect(await reservationStatuses(order.id)).toEqual(["ACTIVE"]);

    const other = await newCustomer();
    await cart.addItem(other.userId, fx.branchId, productId, 4);
    await expect(checkout(other)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    await cart.setQty(other.userId, fx.branchId, productId, 3);
    await expect(checkout(other)).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    expect(await readCounter(fx.branchId, productId)).toBe(0);
  });

  it("seeds a missing counter from Postgres on the first checkout", async () => {
    const productId = await newProduct(5);
    await buy(await newCustomer(), [[productId, 2]]);
    await getRedis().del(`stock:${fx.branchId}:${productId}`);

    const other = await newCustomer();
    await cart.addItem(other.userId, fx.branchId, productId, 4);
    await expect(checkout(other)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    expect(await readCounter(fx.branchId, productId)).toBe(3);
  });

  it("reserves a multi-SKU cart all-or-nothing and lists the short SKUs", async () => {
    const plenty = await newProduct(5, 15000);
    const scarce = await newProduct(1, 15000);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, plenty, 2);
    await cart.addItem(c.userId, fx.branchId, scarce, 2);

    const err = await checkout(c).catch((e) => e);
    expect(err).toMatchObject({ code: "OUT_OF_STOCK", status: 409 });
    const scarceSku = (await pool.query(`SELECT sku FROM products WHERE id = $1`, [scarce])).rows[0].sku;
    expect(err.details.skus).toEqual([scarceSku]);

    expect(await readCounter(fx.branchId, plenty)).toBe(5);
    expect(await readCounter(fx.branchId, scarce)).toBe(1);
    expect(Number((await pool.query(`SELECT count(*) AS n FROM stock_reservations WHERE product_id = ANY($1)`, [[plenty, scarce]])).rows[0].n)).toBe(0);
    expect((await cart.getCart(c.userId, fx.branchId)).items).toHaveLength(2);

    await cart.setQty(c.userId, fx.branchId, scarce, 1);
    const order = await checkout(c);
    expect(await reservationStatuses(order.id)).toEqual(["ACTIVE", "ACTIVE"]);
    expect(await readCounter(fx.branchId, plenty)).toBe(3);
    expect(await readCounter(fx.branchId, scarce)).toBe(0);
  });

  it("respects the per-product buffer", async () => {
    const productId = await newProduct(5);
    await pool.query(`UPDATE branch_products SET stock_buffer = 3 WHERE branch_id = $1 AND product_id = $2`, [fx.branchId, productId]);
    await setStock(fx.branchId, productId, 5);
    expect(await readCounter(fx.branchId, productId)).toBe(2);

    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 3);
    await expect(checkout(c)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
  });

  it("commits the reservation on PAYMENT_SUCCESS and never gives it back afterwards", async () => {
    const commit = vi.spyOn(stockProvider, "commit");
    const productId = await newProduct(5);
    const order = await buy(await newCustomer(), [[productId, 2]]);
    const inv = fake.latest();
    expect(
      (await pool.query(`SELECT invoice_id FROM stock_reservations WHERE order_id = $1`, [order.id])).rows[0].invoice_id,
    ).toBe(inv.id);

    fake.pay(inv.id);
    expect(await pay(inv)).toBe(200);
    await drainOutbox();

    expect(await reservationStatuses(order.id)).toEqual(["COMMITTED"]);
    expect(commit).toHaveBeenCalledWith(`order:${order.id}:commit`, [{ branchId: fx.branchId, productId, qty: 2 }]);
    expect(await releaseOrder(order.id)).toBe(0);
    expect(await readCounter(fx.branchId, productId)).toBe(3);
    commit.mockRestore();
  });

  it("sweeps reservations past expires_at", async () => {
    const productId = await newProduct(5);
    const order = await buy(await newCustomer(), [[productId, 2]]);
    await pool.query(`UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [order.id]);

    expect(await sweepExpired()).toBeGreaterThanOrEqual(1);
    expect(await reservationStatuses(order.id)).toEqual(["RELEASED"]);
    expect(await readCounter(fx.branchId, productId)).toBe(5);
    expect(await sweepExpired()).toBe(0);
    expect(await readCounter(fx.branchId, productId)).toBe(5);
  });

  it("releases the reservation when the order is cancelled before payment", async () => {
    const productId = await newProduct(5);
    fake.failNextCreates = 2;
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 2);
    await expect(checkout(c)).rejects.toMatchObject({ code: "PAYMENT_INIT_FAILED" });
    expect(await readCounter(fx.branchId, productId)).toBe(5);
    await expect(checkout(c)).resolves.toMatchObject({ status: "PENDING_PAYMENT" });
    expect(await readCounter(fx.branchId, productId)).toBe(3);
  });
});
