import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { PlatformWalletResponse } from "@2m/shared";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { pool, withTransaction } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { transition } from "../../src/modules/orders/service";
import { settleOrder } from "../../src/modules/platform-wallet/repo";
import * as wallet from "../../src/modules/platform-wallet/service";

// Every test gets its own branch, so branch-filtered wallet figures never leak between tests.

async function onDelivery(fx: Fixture, o: { fee: number; wage: number; voucher?: number }): Promise<string> {
  const id = await insertOrder(pool, fx, "ON_DELIVERY");
  const voucher = o.voucher ?? 0;
  await pool.query(
    `UPDATE orders SET delivery_fee = $2, voucher_discount = $3, grand_total = 10000 + $2 - $3, courier_wage = $4,
            pricing_snapshot = '{"courier_wage":{"failed_pay_fraction":0.5}}'::jsonb
     WHERE id = $1`,
    [id, o.fee, voucher, o.wage],
  );
  return id;
}

const finish = (fx: Fixture, orderId: string, to: "DELIVERED" | "FAILED") =>
  withTransaction((tx) =>
    transition(tx, {
      orderId,
      to,
      actor: { id: fx.courierId, role: "courier" },
      meta:
        to === "DELIVERED"
          ? { lat: -6.2, lng: 106.8, idempotency_key: randomUUID() }
          : { reason: "CUSTOMER_UNREACHABLE", note: "tidak diangkat" },
    }),
  );

const entriesOf = async (orderId: string) =>
  Object.fromEntries(
    (
      await pool.query<{ type: string; amount: number }>(
        `SELECT type, amount FROM platform_wallet_entries WHERE order_id = $1`,
        [orderId],
      )
    ).rows.map((r) => [r.type, r.amount]),
  );

const refundsOf = async (orderId: string) =>
  (await pool.query<{ reason: string; amount: number }>(`SELECT reason, amount FROM refunds WHERE order_id = $1`, [orderId]))
    .rows;

const overview = (fx: Fixture) => wallet.overview({ branch_id: fx.branchId, limit: 50 });

afterAll(async () => {
  await pool.end();
  await closeRedis();
});

describe("settling finished orders into the 2M wallet", () => {
  it("keeps the ongkir minus the courier's full wage on a delivered order", async () => {
    const fx = await createFixture(pool);
    const id = await onDelivery(fx, { fee: 7500, wage: 6500 });
    await finish(fx, id, "DELIVERED");

    expect(await entriesOf(id)).toEqual({ ONGKIR_IN: 7500, COURIER_PAY: -6500 });
    expect(await refundsOf(id)).toEqual([]);
    const w = await overview(fx);
    expect(w.balance).toBe(1000);
    expect(w.period.subsidized_orders).toBe(0);
  });

  it("refunds a failed delivery in full and charges only the ongkir and half the wage to the wallet", async () => {
    const fx = await createFixture(pool);
    const id = await onDelivery(fx, { fee: 6000, wage: 5000 });
    await finish(fx, id, "FAILED");

    // Goods (10 000) + ongkir (6 000): the customer got nothing, so everything goes back.
    expect(await refundsOf(id)).toEqual([{ reason: "DELIVERY_FAILED", amount: 16000 }]);
    expect(await entriesOf(id)).toEqual({ ONGKIR_IN: 6000, ONGKIR_REFUND: -6000, COURIER_PAY: -2500 });
    const w = await overview(fx);
    expect(w.balance).toBe(-2500);
    // A failed delivery is not a long-distance subsidy.
    expect(w.period.subsidized_orders).toBe(0);
  });

  it("counts a long-distance order whose ongkir is below the wage as a subsidy", async () => {
    const fx = await createFixture(pool);
    await finish(fx, await onDelivery(fx, { fee: 7500, wage: 9500 }), "DELIVERED");
    await finish(fx, await onDelivery(fx, { fee: 5500, wage: 4250 }), "DELIVERED");

    const w = await overview(fx);
    expect(w.balance).toBe(-2000 + 1250);
    expect(w.period.subsidized_orders).toBe(1);
    expect(w.period.subsidy_total).toBe(-2000);
    expect(w.period.by_type.ONGKIR_IN).toBe(13000);
    expect(w.period.by_type.COURIER_PAY).toBe(-13750);
  });

  it("charges an ongkir voucher to the wallet and keeps the courier's wage whole", async () => {
    const fx = await createFixture(pool);
    const delivered = await onDelivery(fx, { fee: 7000, wage: 6125, voucher: 2000 });
    await finish(fx, delivered, "DELIVERED");
    expect(await entriesOf(delivered)).toEqual({ ONGKIR_IN: 7000, VOUCHER: -2000, COURIER_PAY: -6125 });

    // A failed order refunds what the customer paid (goods + ongkir after voucher); the wallet gives back only the
    // ongkir the customer actually paid.
    const failed = await onDelivery(fx, { fee: 7000, wage: 6125, voucher: 2000 });
    await finish(fx, failed, "FAILED");
    expect(await refundsOf(failed)).toEqual([{ reason: "DELIVERY_FAILED", amount: 15000 }]);
    expect(await entriesOf(failed)).toEqual({ ONGKIR_IN: 7000, VOUCHER: -2000, ONGKIR_REFUND: -5000, COURIER_PAY: -3063 });
  });

  it("writes nothing twice when an order is settled again", async () => {
    const fx = await createFixture(pool);
    const id = await onDelivery(fx, { fee: 7500, wage: 6500 });
    await finish(fx, id, "DELIVERED");
    await withTransaction((tx) => settleOrder(tx, id));
    const n = (await pool.query(`SELECT count(*)::int AS n FROM platform_wallet_entries WHERE order_id = $1`, [id])).rows[0].n;
    expect(n).toBe(2);
  });

  it("refunds the goods of a failed order with no ongkir but leaves the wallet untouched", async () => {
    const fx = await createFixture(pool);
    const id = await insertOrder(pool, fx, "ON_DELIVERY");
    await finish(fx, id, "FAILED");
    expect(await entriesOf(id)).toEqual({});
    expect(await refundsOf(id)).toEqual([{ reason: "DELIVERY_FAILED", amount: 10000 }]);
  });

  it("refunds only what is left after an earlier shortage refund", async () => {
    const fx = await createFixture(pool);
    const id = await onDelivery(fx, { fee: 6000, wage: 5000 });
    await pool.query(
      `INSERT INTO refunds (order_id, branch_id, customer_id, reason, amount, dedupe_key)
       SELECT id, branch_id, customer_id, 'ITEM_SHORTAGE', 4000, 'auto:shortage' FROM orders WHERE id = $1`,
      [id],
    );
    await finish(fx, id, "FAILED");
    expect(await refundsOf(id)).toEqual(
      expect.arrayContaining([
        { reason: "ITEM_SHORTAGE", amount: 4000 },
        { reason: "DELIVERY_FAILED", amount: 12000 },
      ]),
    );
    expect((await entriesOf(id)).ONGKIR_REFUND).toBe(-6000);
  });
});

describe("/admin/platform-wallet", () => {
  let fx: Fixture;
  let base: string;
  let close: () => void;

  const bearer = (sub: string, role: string, branchId: string | null) => ({
    Authorization: `Bearer ${jwt.sign({ sub, role, branch_id: branchId }, env.JWT_ACCESS_SECRET)}`,
    "Content-Type": "application/json",
  });
  const superAdmin = () => bearer(fx.users.super_admin, "super_admin", null);
  const post = (headers: Record<string, string>, body: unknown) =>
    fetch(`${base}/admin/platform-wallet/entries`, { method: "POST", headers, body: JSON.stringify(body) });

  beforeAll(async () => {
    fx = await createFixture(pool);
    await finish(fx, await onDelivery(fx, { fee: 7500, wage: 6500 }), "DELIVERED");
    const server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    close = () => server.close();
  });

  afterAll(() => close());

  it("records a branch expense, shows it in the overview and replays the same key", async () => {
    const body = {
      type: "EXPENSE",
      category: "REFUND_COST",
      amount: 300,
      note: "Biaya transfer refund",
      branch_id: fx.branchId,
      idempotency_key: randomUUID(),
    };
    const first = await post(superAdmin(), body);
    expect(first.status).toBe(201);
    const created = (await first.json()) as { id: string; amount: number };
    expect(created.amount).toBe(-300);

    const replay = await post(superAdmin(), body);
    expect(((await replay.json()) as { id: string }).id).toBe(created.id);
    const conflict = await post(superAdmin(), { ...body, amount: 400 });
    expect(conflict.status).toBe(409);

    const res = await fetch(`${base}/admin/platform-wallet?branch_id=${fx.branchId}`, { headers: superAdmin() });
    expect(res.status).toBe(200);
    const w = (await res.json()) as PlatformWalletResponse;
    expect(w.balance).toBe(1000 - 300);
    expect(w.period.expense_by_category.REFUND_COST).toBe(-300);
    expect(w.entries[0]).toMatchObject({ type: "EXPENSE", category: "REFUND_COST", amount: -300, note: "Biaya transfer refund" });
    expect(w.entries.map((e) => e.type).sort()).toEqual(["COURIER_PAY", "EXPENSE", "ONGKIR_IN"]);
  });

  it("records a head-office Google Maps API bill without a branch", async () => {
    const res = await post(superAdmin(), {
      type: "EXPENSE",
      category: "MAPS_API",
      amount: 150_000,
      note: "Tagihan Google Maps API November",
      idempotency_key: randomUUID(),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const row = (await pool.query(`SELECT branch_id, amount, category FROM platform_wallet_entries WHERE id = $1`, [id])).rows[0];
    expect(row).toEqual({ branch_id: null, amount: -150_000, category: "MAPS_API" });
  });

  it("validates the category rule and refuses everyone but super_admin", async () => {
    const noCategory = await post(superAdmin(), { type: "EXPENSE", amount: 1000, note: "tanpa kategori", idempotency_key: randomUUID() });
    expect(noCategory.status).toBe(400);
    const topUpWithCategory = await post(superAdmin(), {
      type: "TOP_UP",
      category: "OTHER",
      amount: 1000,
      note: "salah",
      idempotency_key: randomUUID(),
    });
    expect(topUpWithCategory.status).toBe(400);

    const asBranchAdmin = await fetch(`${base}/admin/platform-wallet?branch_id=${fx.branchId}`, {
      headers: bearer(fx.users.branch_admin, "branch_admin", fx.branchId),
    });
    expect(asBranchAdmin.status).toBe(403);
  });
});
