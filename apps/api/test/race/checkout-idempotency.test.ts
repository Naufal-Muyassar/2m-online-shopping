import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { closeRedis, getRedis } from "../../src/shared/redis";
import { createFixture, giveStock, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as cart from "../../src/modules/cart/service";
import { createOrder } from "../../src/modules/orders/customer";
import { FakeProvider } from "../../src/modules/payments/fake-provider";
import { setPaymentProvider } from "../../src/modules/payments/registry";
import { handleXenditWebhook } from "../../src/modules/payments/service";
import { processBatch } from "../../src/modules/events/service";
import { sweepExpired } from "../../src/modules/inventory/service";
import { counterKey, readCounter } from "../../src/modules/inventory/counters";
// Registers the outbox handlers (stock release / commit); starts no loops.
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

async function newProduct(stock: number): Promise<string> {
  const id = (
    await pool.query(
      `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $1, 'pcs', 'test', 1) RETURNING id`,
      [`I-${tag}-${seq++}`],
    )
  ).rows[0].id as string;
  await pool.query(`INSERT INTO branch_products (branch_id, product_id, price) VALUES ($1, $2, 25000)`, [fx.branchId, id]);
  await giveStock(pool, fx.branchId, id, stock);
  return id;
}

async function newCustomer() {
  const n = seq++;
  const userId = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('customer', $1, $2, 'x') RETURNING id`,
      [`i-${tag}-${n}`, `t-i-${tag}-${n}`],
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

const reqOf = (c: { addressId: string }, payment_method: "QRIS" | "VA_BCA" = "QRIS") => ({
  branch_id: fx.branchId,
  address_id: c.addressId,
  payment_method,
});

const ordersOf = async (userId: string) =>
  Number((await pool.query(`SELECT count(*) AS n FROM orders WHERE customer_id = $1`, [userId])).rows[0].n);

async function drainOutbox(): Promise<void> {
  for (let i = 0; i < 20; i++) if ((await processBatch()) === 0) return;
}

describe("checkout idempotency key", () => {
  it("replays the first order when the same key is sent again, without reserving twice", async () => {
    const productId = await newProduct(5);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 2);
    const key = randomUUID();

    const first = await createOrder(c.userId, reqOf(c), key);
    const again = await createOrder(c.userId, reqOf(c), key);

    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(again.order).toEqual(first.order);
    expect(await ordersOf(c.userId)).toBe(1);
    expect(fake.invoices.size).toBe(1);
    expect(await readCounter(fx.branchId, productId)).toBe(3);
  });

  it("creates one order from 20 concurrent copies of one key", async () => {
    const productId = await newProduct(5);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 1);
    const key = randomUUID();

    const results = await Promise.allSettled(Array.from({ length: 20 }, () => createOrder(c.userId, reqOf(c), key)));
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // Copies that arrive while the owner is still creating the invoice are told to retry; nothing else may fail.
    for (const f of failed) expect(f.reason).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    expect(ok.filter((r) => !r.replayed)).toHaveLength(1);
    const orderId = ok.find((r) => !r.replayed)!.order.id;
    for (const r of ok) expect(r.order.id).toBe(orderId);

    // After the owner finished, a retry gets the same order.
    const retry = await createOrder(c.userId, reqOf(c), key);
    expect(retry).toMatchObject({ replayed: true, order: { id: orderId, status: "PENDING_PAYMENT" } });
    expect(await ordersOf(c.userId)).toBe(1);
    expect(await readCounter(fx.branchId, productId)).toBe(4);
  });

  it("refuses the same key with a different request (422) and keeps keys per customer", async () => {
    const productId = await newProduct(5);
    const a = await newCustomer();
    const b = await newCustomer();
    await cart.addItem(a.userId, fx.branchId, productId, 1);
    await cart.addItem(b.userId, fx.branchId, productId, 1);
    const key = randomUUID();

    await createOrder(a.userId, reqOf(a), key);
    await expect(createOrder(a.userId, reqOf(a, "VA_BCA"), key)).rejects.toMatchObject({
      status: 422,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    // Another customer using the same UUID is a different checkout and sees nothing of the first.
    const other = await createOrder(b.userId, reqOf(b), key);
    expect(other.replayed).toBe(false);
    expect(await ordersOf(b.userId)).toBe(1);
  });

  it("replays a failed payment start as the same error and keeps the stock free", async () => {
    const productId = await newProduct(5);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 2);
    fake.failNextCreates = 2;
    const key = randomUUID();

    await expect(createOrder(c.userId, reqOf(c), key)).rejects.toMatchObject({ code: "PAYMENT_INIT_FAILED" });
    await expect(createOrder(c.userId, reqOf(c), key)).rejects.toMatchObject({ code: "PAYMENT_INIT_FAILED" });
    expect(await ordersOf(c.userId)).toBe(1);
    expect(await readCounter(fx.branchId, productId)).toBe(5);

    // A new press is a new intent with a new key; the restored cart checks out normally.
    await expect(createOrder(c.userId, reqOf(c), randomUUID())).resolves.toMatchObject({ order: { status: "PENDING_PAYMENT" } });
  });

  it("does not keep a key whose checkout was refused, so a retry is evaluated again", async () => {
    const productId = await newProduct(1);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 1);
    const rival = await newCustomer();
    await cart.addItem(rival.userId, fx.branchId, productId, 1);
    await createOrder(rival.userId, reqOf(rival), randomUUID());

    const key = randomUUID();
    await expect(createOrder(c.userId, reqOf(c), key)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    const kept = await pool.query(`SELECT 1 FROM checkout_requests WHERE customer_id = $1`, [c.userId]);
    expect(kept.rowCount).toBe(0);
  });
});

describe("stock guards behind the Redis counter", () => {
  it("never oversells when the Redis counter drifted above Postgres", async () => {
    const productId = await newProduct(2);
    const customers = await Promise.all(Array.from({ length: 15 }, newCustomer));
    for (const c of customers) await cart.addItem(c.userId, fx.branchId, productId, 1);
    // Simulate a counter that is wrong upwards (lost decrement, bad restore): Redis would admit everyone.
    await getRedis().set(counterKey(fx.branchId, productId), 100);

    const results = await Promise.allSettled(customers.map((c) => createOrder(c.userId, reqOf(c), randomUUID())));
    const won = results.filter((r) => r.status === "fulfilled");
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "OUT_OF_STOCK" });

    expect(won).toHaveLength(2);
    const held = await pool.query(
      `SELECT COALESCE(sum(qty), 0)::int AS n FROM stock_reservations WHERE product_id = $1 AND status IN ('ACTIVE', 'COMMITTED')`,
      [productId],
    );
    expect(held.rows[0].n).toBe(2);
    // The refusing checkouts schedule a refresh; the counter converges to Postgres.
    await expect.poll(() => readCounter(fx.branchId, productId), { timeout: 5000 }).toBe(0);
  });

  it("keeps the units of an order still waiting for payment past the reservation expiry, so a late payment is honoured", async () => {
    const productId = await newProduct(3);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 2);
    const { order } = await createOrder(c.userId, reqOf(c), randomUUID());
    await pool.query(`UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [order.id]);

    await sweepExpired();
    expect((await pool.query(`SELECT status FROM stock_reservations WHERE order_id = $1`, [order.id])).rows[0].status).toBe("ACTIVE");
    expect(await readCounter(fx.branchId, productId)).toBe(1);

    const inv = fake.latest();
    fake.pay(inv.id);
    await handleXenditWebhook(JSON.stringify({ id: inv.id, external_id: inv.externalId, status: "PAID", amount: inv.amount }), {
      "x-callback-token": fake.callbackToken,
    });
    await drainOutbox();
    expect((await pool.query(`SELECT status FROM stock_reservations WHERE order_id = $1`, [order.id])).rows[0].status).toBe("COMMITTED");
    expect(await readCounter(fx.branchId, productId)).toBe(1);
  });

  it("commits a paid order whose reservation the outbox never committed instead of releasing it", async () => {
    const productId = await newProduct(3);
    const c = await newCustomer();
    await cart.addItem(c.userId, fx.branchId, productId, 1);
    const { order } = await createOrder(c.userId, reqOf(c), randomUUID());
    // PAID without the PAYMENT_SUCCESS handler having run (outbox lagging or out of attempts).
    await pool.query(`UPDATE orders SET status = 'PAID' WHERE id = $1`, [order.id]);
    await pool.query(`UPDATE stock_reservations SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [order.id]);

    await sweepExpired();
    expect((await pool.query(`SELECT status FROM stock_reservations WHERE order_id = $1`, [order.id])).rows[0].status).toBe("COMMITTED");
    expect(await readCounter(fx.branchId, productId)).toBe(2);
  });
});
