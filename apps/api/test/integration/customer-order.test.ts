import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, giveStock, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as cart from "../../src/modules/cart/service";
import * as address from "../../src/modules/address/service";
import { createOrder, getCustomerOrder } from "../../src/modules/orders/customer";
import { quote } from "../../src/modules/pricing/service";
import { FakeProvider } from "../../src/modules/payments/fake-provider";
import { setPaymentProvider } from "../../src/modules/payments/registry";

let fx: Fixture;
let productId: string;
let heavyProductId: string;
let nearAddressId: string;

beforeAll(async () => {
  setPaymentProvider(new FakeProvider());
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
  const mk = async (weight: number, price: number) => {
    const id = (
      await pool.query(
        `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $1, 'pcs', 'test', $2) RETURNING id`,
        [`T-${tag}-${weight}`, weight],
      )
    ).rows[0].id as string;
    await pool.query(`INSERT INTO branch_products (branch_id, product_id, price) VALUES ($1, $2, $3)`, [fx.branchId, id, price]);
    await giveStock(pool, fx.branchId, id, 100);
    return id;
  };
  productId = await mk(1, 15000);
  heavyProductId = await mk(20, 50000);
  nearAddressId = (
    await address.create(fx.users.customer, {
      branch_id: fx.branchId, label: "near", lat: -6.205, lng: 106.805, street: "x", receiver_name: "x", receiver_phone: "0812345678",
    })
  ).id;
});

afterAll(async () => {
  setPaymentProvider(null);
  await closeRedis();
  await pool.end();
});

describe("customer ordering", () => {
  it("rejects pins outside the branch radius", async () => {
    await expect(
      address.create(fx.users.customer, {
        branch_id: fx.branchId, label: "far", lat: -6.5, lng: 107.5, street: "x", receiver_name: "x", receiver_phone: "0812345678",
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_COVERAGE" });
  });

  it("enforces per-SKU and weight limits on cart mutations", async () => {
    await expect(cart.addItem(fx.users.customer, fx.branchId, productId, 6)).rejects.toMatchObject({ code: "MAX_QTY_EXCEEDED" });
    await cart.addItem(fx.users.customer, fx.branchId, heavyProductId, 1);
    await expect(cart.addItem(fx.users.customer, fx.branchId, heavyProductId, 1)).rejects.toMatchObject({
      code: "MAX_WEIGHT_EXCEEDED",
    });
    await cart.removeItem(fx.users.customer, fx.branchId, heavyProductId);
  });

  it("prices, creates a PENDING_PAYMENT order and empties the cart", async () => {
    await cart.addItem(fx.users.customer, fx.branchId, productId, 3);
    const req = { branch_id: fx.branchId, address_id: nearAddressId, payment_method: "QRIS" as const };
    const q = await quote(pool, fx.users.customer, req);
    expect(q.breakdown.subtotal).toBe(45000);
    expect(q.breakdown.payment_fee).toBe(0);
    expect(q.breakdown.grand_total).toBe(45000 + q.breakdown.final_shipping_cost);

    const order = await createOrder(fx.users.customer, req);
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.code).toMatch(/^ORD-\d{6}-[A-Z0-9]{4}$/);
    expect(order.grand_total).toBe(q.breakdown.grand_total);
    expect(order.invoice_url).toMatch(/^https:\/\/checkout\.test\//);

    const detail = await getCustomerOrder(fx.users.customer, order.id);
    expect(detail.invoice_url).toBe(order.invoice_url);
    expect(detail.items).toHaveLength(1);
    expect(detail.timeline.map((t) => t.status)).toEqual(["PENDING_PAYMENT"]);
    await expect(createOrder(fx.users.customer, req)).rejects.toMatchObject({ code: "CART_EMPTY" });
  });

  it("refuses vouchers for now", async () => {
    await expect(
      quote(pool, fx.users.customer, { branch_id: fx.branchId, address_id: nearAddressId, payment_method: "QRIS", voucher_code: "X" }),
    ).rejects.toMatchObject({ code: "VOUCHER_UNSUPPORTED" });
  });
});
