import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import { env } from "../../src/config/env";
import { forcePaid } from "../../src/modules/admin/service";
import { createApp } from "../../src/app";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, giveStock, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as cart from "../../src/modules/cart/service";
import * as address from "../../src/modules/address/service";
import { createOrder } from "../../src/modules/orders/customer";
import { MockAdapter } from "../../src/modules/payments/mock.adapter";
import { expireMockInvoice, payMockInvoice } from "../../src/modules/payments/mock.service";
import { setPaymentProvider } from "../../src/modules/payments/registry";

let fx: Fixture;
let productId: string;
let addressId: string;

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
      `M-${tag}`,
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
  setPaymentProvider(new MockAdapter(pool, env.CUSTOMER_WEB_URL));
});

afterAll(async () => {
  setPaymentProvider(null);
  await closeRedis();
  await pool.end();
});

async function placeOrder() {
  await cart.addItem(fx.users.customer, fx.branchId, productId, 2);
  const order = await createOrder(fx.users.customer, { branch_id: fx.branchId, address_id: addressId, payment_method: "QRIS" });
  const invoiceId = (await pool.query(`SELECT invoice_id FROM orders WHERE id = $1`, [order.id])).rows[0].invoice_id as string;
  return { order, invoiceId };
}

const statusOf = async (orderId: string) =>
  (await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status as string;
const count = async (sql: string, params: unknown[]) => Number((await pool.query(sql, params)).rows[0].n);

describe("mock payment provider", () => {
  it("creates a PENDING_PAYMENT order whose invoice_url points at the customer-web mock page", async () => {
    const { order, invoiceId } = await placeOrder();
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.invoice_url).toBe(`${env.CUSTOMER_WEB_URL}/mock-pay/${invoiceId}`);
    const row = (await pool.query(`SELECT amount, method, status FROM mock_invoices WHERE invoice_id = $1`, [invoiceId])).rows[0];
    expect(row).toEqual({ amount: order.grand_total, method: "QRIS", status: "PENDING" });
  });

  it("mock pay settles the order to PAID exactly once, and paying twice is a no-op", async () => {
    const { order, invoiceId } = await placeOrder();
    expect(await payMockInvoice(invoiceId)).toBe("PAID");
    expect(await statusOf(order.id)).toBe("PAID");

    expect(await payMockInvoice(invoiceId)).toBe("NOOP_STATE");
    expect(await statusOf(order.id)).toBe("PAID");
    expect(await count(`SELECT count(*) AS n FROM order_state_transitions WHERE order_id = $1 AND to_status = 'PAID'`, [order.id])).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'PAYMENT_SUCCESS'`, [order.id])).toBe(1);
  });

  it("expire cancels the order, and an expired invoice can no longer be paid", async () => {
    const { order, invoiceId } = await placeOrder();
    expect(await expireMockInvoice(invoiceId)).toBe("EXPIRED_CANCELLED");
    expect(await statusOf(order.id)).toBe("CANCELLED");
    const reason = (await pool.query(`SELECT reason FROM order_state_transitions WHERE order_id = $1 AND to_status = 'CANCELLED'`, [order.id])).rows[0];
    expect(reason.reason).toBe("PAYMENT_EXPIRED");
    await expect(payMockInvoice(invoiceId)).rejects.toMatchObject({ code: "INVOICE_EXPIRED" });
    expect(await statusOf(order.id)).toBe("CANCELLED");
  });

  it("refuses the Xendit webhook token", async () => {
    expect(new MockAdapter(pool, env.CUSTOMER_WEB_URL).verifyCallbackToken("anything")).toBe(false);
  });

  it.skipIf(env.PAYMENT_PROVIDER !== "mock")("serves the dev router over HTTP to the order owner", async () => {
    const { order, invoiceId } = await placeOrder();
    const server = createApp().listen(0);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/dev/mock-payments/${invoiceId}`;
      const headers = { Authorization: `Bearer ${jwt.sign({ sub: fx.users.customer, role: "customer", branch_id: null }, env.JWT_ACCESS_SECRET)}` };
      const info = await (await fetch(base, { headers })).json();
      expect(info).toMatchObject({ invoice_id: invoiceId, order_id: order.id, status: "PENDING", amount: order.grand_total });
      const paid = await (await fetch(`${base}/pay`, { method: "POST", headers })).json();
      expect(paid).toMatchObject({ outcome: "PAID", invoice: { status: "PAID", order_id: order.id } });
      expect(await statusOf(order.id)).toBe("PAID");
    } finally {
      server.close();
    }
  });
});

const bearer = (sub: string, role: string) => ({
  Authorization: `Bearer ${jwt.sign({ sub, role, branch_id: null }, env.JWT_ACCESS_SECRET)}`,
});
const isDemoPayment = async (orderId: string) =>
  (await pool.query(`SELECT is_demo_payment FROM orders WHERE id = $1`, [orderId])).rows[0].is_demo_payment as boolean;

describe("demo payment path", () => {
  it.skipIf(env.PAYMENT_PROVIDER !== "mock" || !env.DEMO_MODE)("answers 404 to a caller who does not own the order", async () => {
    const { order, invoiceId } = await placeOrder();
    const stranger = (
      await pool.query(
        `INSERT INTO users (role, name, phone, password_hash) VALUES ('customer', 'stranger', $1, 'x') RETURNING id`,
        [`t-stranger-${randomUUID().slice(0, 8)}`],
      )
    ).rows[0].id as string;
    const server = createApp().listen(0);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/dev/mock-payments/${invoiceId}`;
      expect((await fetch(base)).status).toBe(401);
      for (const headers of [bearer(stranger, "customer"), bearer(fx.users.branch_admin, "branch_admin")]) {
        expect((await fetch(base, { headers })).status).toBe(404);
        expect((await fetch(`${base}/pay`, { method: "POST", headers })).status).toBe(404);
      }
      expect(await statusOf(order.id)).toBe("PENDING_PAYMENT");
    } finally {
      server.close();
    }
  });

  it("settles to PAID exactly once and flags the order as a demo payment", async () => {
    const { order, invoiceId } = await placeOrder();
    expect(await isDemoPayment(order.id)).toBe(false);
    await Promise.all([payMockInvoice(invoiceId), payMockInvoice(invoiceId)]);
    expect(await statusOf(order.id)).toBe("PAID");
    expect(await isDemoPayment(order.id)).toBe(true);
    expect(await count(`SELECT count(*) AS n FROM order_state_transitions WHERE order_id = $1 AND to_status = 'PAID'`, [order.id])).toBe(1);
  });

  it("flags an admin force-paid order as a demo payment", async () => {
    const { order } = await placeOrder();
    await forcePaid({ orderId: order.id, adminId: fx.users.super_admin });
    expect(await statusOf(order.id)).toBe("PAID");
    expect(await isDemoPayment(order.id)).toBe(true);
  });

  it("serves /meta/config from the env", async () => {
    const server = createApp().listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/meta/config`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ demo_mode: env.DEMO_MODE });
    } finally {
      server.close();
    }
  });
});
