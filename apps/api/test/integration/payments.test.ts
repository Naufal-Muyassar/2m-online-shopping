import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/app";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, giveStock, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as cart from "../../src/modules/cart/service";
import * as address from "../../src/modules/address/service";
import { createOrder } from "../../src/modules/orders/customer";
import { FakeProvider } from "../../src/modules/payments/fake-provider";
import { setPaymentProvider } from "../../src/modules/payments/registry";
import type { Invoice } from "../../src/modules/payments/provider";
import { handleXenditWebhook, reconcilePayments } from "../../src/modules/payments/service";

let fx: Fixture;
let productId: string;
let addressId: string;
let fake: FakeProvider;

beforeAll(async () => {
  fx = await createFixture(pool);
  const tag = randomUUID().slice(0, 8);
  await pool.query(
    `INSERT INTO branch_pricing_config (branch_id, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order)
     VALUES ($1, 5000, 2000, 1, 20, 500, 6000, 30000, 20000)`,
    [fx.branchId],
  );
  await pool.query(
    `INSERT INTO branch_limits (branch_id, max_qty_per_sku_default, max_order_weight_kg, heavy_order_threshold_kg)
     VALUES ($1, 5, 30, 25)`,
    [fx.branchId],
  );
  productId = (
    await pool.query(`INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $1, 'pcs', 'test', 1) RETURNING id`, [
      `P-${tag}`,
    ])
  ).rows[0].id as string;
  await pool.query(`INSERT INTO branch_products (branch_id, product_id, price) VALUES ($1, $2, 15000)`, [fx.branchId, productId]);
  await giveStock(pool, fx.branchId, productId, 1000);
  addressId = (
    await address.create(fx.users.customer, {
      branch_id: fx.branchId, label: "near", lat: -6.205, lng: 106.805, street: "x", receiver_name: "x", receiver_phone: "0812345678",
    })
  ).id;
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

const req = () => ({ branch_id: fx.branchId, address_id: addressId, payment_method: "QRIS" as const });

async function placeOrder() {
  await cart.addItem(fx.users.customer, fx.branchId, productId, 2);
  return createOrder(fx.users.customer, req());
}

const callback = (inv: Invoice, opts: { token?: string; status?: string; amount?: number } = {}) =>
  handleXenditWebhook(
    JSON.stringify({ id: inv.id, external_id: inv.externalId, status: opts.status ?? "PAID", amount: opts.amount ?? inv.amount }),
    { "x-callback-token": opts.token ?? fake.callbackToken, "content-type": "application/json" },
  );

const statusOf = async (orderId: string) =>
  (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status as string;
const count = async (sql: string, params: unknown[]) => Number((await pool.query(sql, params)).rows[0].n);

describe("invoice creation", () => {
  it("moves the order to PENDING_PAYMENT with invoice data from the provider", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    expect(inv.externalId).toBe(`${order.code}-1`);
    expect(inv.amount).toBe(order.grand_total);
    const row = (await pool.query(`SELECT status, invoice_id, invoice_url, invoice_expires_at FROM orders WHERE id = $1`, [order.id])).rows[0];
    expect(row).toMatchObject({ status: "PENDING_PAYMENT", invoice_id: inv.id, invoice_url: inv.invoiceUrl });
    expect(row.invoice_expires_at).toBeInstanceOf(Date);
  });

  it("cancels with PAYMENT_INIT_FAILED and gives the cart back when the provider is down", async () => {
    fake.failNextCreates = 5;
    await cart.addItem(fx.users.customer, fx.branchId, productId, 2);
    await expect(createOrder(fx.users.customer, req())).rejects.toMatchObject({ code: "PAYMENT_INIT_FAILED" });
    const o = (await pool.query(`SELECT id, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`, [fx.users.customer])).rows[0];
    expect(o.status).toBe("CANCELLED");
    const reason = (await pool.query(`SELECT reason FROM order_state_transitions WHERE order_id = $1 AND to_status = 'CANCELLED'`, [o.id])).rows[0];
    expect(reason.reason).toBe("PAYMENT_INIT_FAILED");
    expect((await cart.getCart(fx.users.customer, fx.branchId)).items).toHaveLength(1);
    await cart.removeItem(fx.users.customer, fx.branchId, productId);
  });

  it("looks the invoice up by external_id on retry instead of creating a second one", async () => {
    fake.loseNextCreateResponse = true;
    const order = await placeOrder();
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(fake.createCalls).toBe(1);
    expect(fake.invoices.size).toBe(1);
  });
});

describe("xendit webhook", () => {
  it("same webhook three times causes exactly one transition", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);

    const results = await Promise.all([callback(inv), callback(inv), callback(inv)]);
    expect(results).toEqual([200, 200, 200]);
    expect(await callback(inv)).toBe(200);

    expect(await statusOf(order.id)).toBe("PAID");
    expect(await count(`SELECT count(*) AS n FROM order_state_transitions WHERE order_id = $1 AND to_status = 'PAID'`, [order.id])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'PAYMENT_SUCCESS'`, [order.id])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM payment_events WHERE invoice_id = $1`, [inv.id])).toBe(1);
    expect((await pool.query(`SELECT payment_fee_actual FROM orders WHERE id = $1`, [order.id])).rows[0].payment_fee_actual).toBe(700);
  });

  it("answers 401 to a wrong or missing token and stores nothing", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);
    expect(await callback(inv, { token: "nope" })).toBe(401);
    expect(await handleXenditWebhook("{}", {})).toBe(401);
    expect(await statusOf(order.id)).toBe("PENDING_PAYMENT");
    expect(await count(`SELECT count(*) AS n FROM payment_events WHERE invoice_id = $1`, [inv.id])).toBe(0);
  });

  it("does not store the callback token in payment_events", async () => {
    await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);
    await callback(inv);
    const row = (await pool.query(`SELECT headers, raw_body FROM payment_events WHERE invoice_id = $1`, [inv.id])).rows[0];
    expect(JSON.stringify(row.headers)).not.toContain(fake.callbackToken);
    expect(row.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(row.raw_body).id).toBe(inv.id);
  });

  it("rejects an altered amount and ignores a forged body", async () => {
    const order = await placeOrder();
    const inv = fake.latest();

    // The body claims PAID but the provider still says PENDING.
    expect(await callback(inv)).toBe(200);
    expect(await statusOf(order.id)).toBe("PENDING_PAYMENT");

    // The provider reports a different paid amount than the order total.
    fake.pay(inv.id, inv.amount - 1000);
    expect(await callback(inv, { status: "SETTLED" })).toBe(200);
    expect(await statusOf(order.id)).toBe("PENDING_PAYMENT");
    const ev = (await pool.query(`SELECT outcome FROM payment_events WHERE invoice_id = $1 AND status = 'SETTLED'`, [inv.id])).rows[0];
    expect(ev.outcome).toBe("AMOUNT_MISMATCH");
  });

  it("cancels the order with PAYMENT_EXPIRED when the invoice expired", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.expire(inv.id);
    expect(await callback(inv, { status: "EXPIRED" })).toBe(200);
    expect(await statusOf(order.id)).toBe("CANCELLED");
    expect(await count(`SELECT count(*) AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'PAYMENT_EXPIRED'`, [order.id])).toBe(1);
  });

  it("never moves a PAID order backwards and treats SETTLED after PAID as a no-op", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);
    await callback(inv);
    fake.pay(inv.id, undefined, "SETTLED");
    expect(await callback(inv, { status: "SETTLED" })).toBe(200);
    fake.expire(inv.id);
    expect(await callback(inv, { status: "EXPIRED" })).toBe(200);
    expect(await statusOf(order.id)).toBe("PAID");
    expect(await count(`SELECT count(*) AS n FROM order_state_transitions WHERE order_id = $1 AND to_status = 'PAID'`, [order.id])).toBe(1);
  });
});

describe("webhook route", () => {
  it("authenticates over HTTP with an empty 401 and settles with a valid token", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);
    const server = createApp().listen(0);
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/webhooks/xendit`;
      const body = JSON.stringify({ id: inv.id, external_id: inv.externalId, status: "PAID" });
      const bad = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-callback-token": "bad" }, body });
      expect(bad.status).toBe(401);
      expect(await bad.text()).toBe("");
      expect(await statusOf(order.id)).toBe("PENDING_PAYMENT");

      const ok = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-callback-token": fake.callbackToken }, body });
      expect(ok.status).toBe(200);
      expect(await statusOf(order.id)).toBe("PAID");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe("reconciliation", () => {
  it("completes an order whose webhook was lost", async () => {
    const order = await placeOrder();
    const inv = fake.latest();
    fake.pay(inv.id);
    await pool.query(`UPDATE orders SET created_at = now() - interval '25 minutes' WHERE id = $1`, [order.id]);

    await reconcilePayments();
    expect(await statusOf(order.id)).toBe("PAID");
    expect(await count(`SELECT count(*) AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'PAYMENT_SUCCESS'`, [order.id])).toBe(1);
  });

  it("leaves a still-pending invoice alone and cancels an expired one", async () => {
    const pending = await placeOrder();
    const pendingInv = fake.latest();
    const expired = await placeOrder();
    const expiredInv = fake.latest();
    fake.expire(expiredInv.id);
    await pool.query(`UPDATE orders SET created_at = now() - interval '25 minutes' WHERE id = ANY($1)`, [[pending.id, expired.id]]);

    await reconcilePayments();
    expect(await statusOf(pending.id)).toBe("PENDING_PAYMENT");
    expect(await statusOf(expired.id)).toBe("CANCELLED");
    expect(pendingInv.id).not.toBe(expiredInv.id);
  });
});
