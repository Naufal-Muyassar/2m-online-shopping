import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { pool, withTransaction } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { transition } from "../../src/modules/orders/service";
import { creditOrder } from "../../src/modules/earnings/repo";
import * as earnings from "../../src/modules/earnings/service";

const WAGE = 8000;

// Every test gets its own branch and courier, so balances never leak between tests.
const newFixture = () => createFixture(pool);

async function onDelivery(fx: Fixture, wage: number | null = WAGE): Promise<string> {
  const id = await insertOrder(pool, fx, "ON_DELIVERY");
  await pool.query(
    `UPDATE orders SET courier_wage = $2, pricing_snapshot = '{"courier_wage":{"failed_pay_fraction":0.5}}'::jsonb WHERE id = $1`,
    [id, wage],
  );
  return id;
}

const deliver = (fx: Fixture, orderId: string, idempotencyKey: string = randomUUID()) =>
  withTransaction((tx) =>
    transition(tx, {
      orderId,
      to: "DELIVERED",
      actor: { id: fx.courierId, role: "courier" },
      meta: { lat: -6.2, lng: 106.8, idempotency_key: idempotencyKey },
    }),
  );

const fail = (fx: Fixture, orderId: string) =>
  withTransaction((tx) =>
    transition(tx, {
      orderId,
      to: "FAILED",
      actor: { id: fx.courierId, role: "courier" },
      meta: { reason: "CUSTOMER_UNREACHABLE", note: "tidak diangkat" },
    }),
  );

const balanceOf = async (fx: Fixture) => (await earnings.courierBalance(fx.courierId)).balance;

const withdraw = (fx: Fixture, amount: number, idempotencyKey: string = randomUUID()) =>
  earnings.recordWithdrawal({
    courierId: fx.courierId,
    branchId: fx.branchId,
    adminId: fx.users.branch_admin,
    amount,
    idempotencyKey,
  });

async function funded(amount: number): Promise<Fixture> {
  const fx = await newFixture();
  await deliver(fx, await onDelivery(fx, amount));
  return fx;
}

const ledgerRows = async (fx: Fixture) =>
  (await pool.query(`SELECT count(*)::int AS n FROM courier_ledger_entries WHERE courier_id = $1`, [fx.courierId])).rows[0].n as number;

afterAll(async () => {
  await pool.end();
  await closeRedis();
});

describe("crediting finished orders", () => {
  it("credits a delivered order its full pay", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    await deliver(fx, orderId);
    expect(await balanceOf(fx)).toBe(WAGE);

    const { entries } = await earnings.courierHistory(fx.courierId, { limit: 20 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "EARNING", amount: WAGE, order_status: "DELIVERED", recorded_by_name: null });
  });

  it("credits a failed delivery its reduced pay", async () => {
    const fx = await newFixture();
    await fail(fx, await onDelivery(fx));
    expect(await balanceOf(fx)).toBe(WAGE / 2);
    const { entries } = await earnings.courierHistory(fx.courierId, { limit: 20 });
    expect(entries[0]).toMatchObject({ type: "EARNING", amount: WAGE / 2, order_status: "FAILED" });
  });

  it("does not double-credit a retried request with the same idempotency key", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    const key = randomUUID();
    await deliver(fx, orderId, key);
    const retried = await deliver(fx, orderId, key);
    expect(retried.replayed).toBe(true);
    expect(await balanceOf(fx)).toBe(WAGE);
    expect(await ledgerRows(fx)).toBe(1);
  });

  it("does not double-credit a second attempt with a new key", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    await deliver(fx, orderId);
    await expect(deliver(fx, orderId)).rejects.toMatchObject({ status: 409, code: "INVALID_TRANSITION" });
    expect(await balanceOf(fx)).toBe(WAGE);
  });

  it("credits once when the same order finishes concurrently", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => deliver(fx, orderId)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(fx)).toBe(WAGE);
    expect(await ledgerRows(fx)).toBe(1);
  });

  it("ignores a direct second credit, so the guarantee does not depend on transition()", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    await deliver(fx, orderId);
    await withTransaction((tx) => creditOrder(tx, orderId));
    expect(await balanceOf(fx)).toBe(WAGE);
    expect(await ledgerRows(fx)).toBe(1);
  });

  it("rolls the credit back with the transition", async () => {
    const fx = await newFixture();
    const orderId = await onDelivery(fx);
    await expect(
      withTransaction(async (tx) => {
        await transition(tx, {
          orderId,
          to: "DELIVERED",
          actor: { id: fx.courierId, role: "courier" },
          meta: { lat: -6.2, lng: 106.8 },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await balanceOf(fx)).toBe(0);
  });

  it("leaves no entry for an order without a wage", async () => {
    const fx = await newFixture();
    await deliver(fx, await onDelivery(fx, null));
    expect(await balanceOf(fx)).toBe(0);
    expect(await ledgerRows(fx)).toBe(0);
  });

  it("does not backfill orders that finished before the ledger", async () => {
    const fx = await newFixture();
    const orderId = await insertOrder(pool, fx, "DELIVERED");
    await pool.query(`UPDATE orders SET courier_pay_final = $2, assigned_courier_id = $3 WHERE id = $1`, [orderId, WAGE, fx.courierId]);
    expect(await balanceOf(fx)).toBe(0);
  });
});

describe("recording a withdrawal", () => {
  it("reduces the balance, records who did it, and audits it", async () => {
    const fx = await funded(10_000);
    const res = await withdraw(fx, 3000);
    expect(res).toMatchObject({ amount: 3000, balance: 7000 });
    expect(await balanceOf(fx)).toBe(7000);

    const { entries } = await earnings.courierHistory(fx.courierId, { limit: 20 });
    expect(entries[0]).toMatchObject({ type: "WITHDRAWAL", amount: -3000, order_code: null });
    expect(entries[0]?.recorded_by_name).toContain("branch_admin-");

    const audits = await pool.query(`SELECT actor_id, after FROM audit_logs WHERE action = 'COURIER_WITHDRAWAL' AND entity_id = $1`, [
      fx.courierId,
    ]);
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].actor_id).toBe(fx.users.branch_admin);
    expect(audits.rows[0].after).toMatchObject({ amount: 3000, balance: 7000 });
  });

  it("has no minimum: one rupiah and the whole balance are both allowed", async () => {
    const fx = await funded(10_000);
    await withdraw(fx, 1);
    expect((await withdraw(fx, 9999)).balance).toBe(0);
  });

  it("refuses to overdraw and changes nothing", async () => {
    const fx = await funded(10_000);
    await expect(withdraw(fx, 10_001)).rejects.toMatchObject({
      status: 409,
      code: "INSUFFICIENT_BALANCE",
      details: { balance: 10_000 },
    });
    expect(await balanceOf(fx)).toBe(10_000);
    expect(await ledgerRows(fx)).toBe(1);
  });

  it("refuses any withdrawal from an empty balance", async () => {
    const fx = await newFixture();
    await expect(withdraw(fx, 1)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
  });

  it("never overdraws under concurrent withdrawals", async () => {
    const fx = await funded(10_000);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => withdraw(fx, 3000)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(3);
    expect(refused).toHaveLength(5);
    for (const r of refused) expect(r.reason).toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(await balanceOf(fx)).toBe(1000);
  });

  it("debits a retried request once, even when retries race", async () => {
    const fx = await funded(10_000);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => withdraw(fx, 4000, key)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await balanceOf(fx)).toBe(6000);
    expect(await ledgerRows(fx)).toBe(2);
  });

  it("refuses a reused key with a different amount", async () => {
    const fx = await funded(10_000);
    const key = randomUUID();
    await withdraw(fx, 4000, key);
    await expect(withdraw(fx, 3000, key)).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(await balanceOf(fx)).toBe(6000);
  });

  it("counts earnings credited after a withdrawal", async () => {
    const fx = await funded(10_000);
    await withdraw(fx, 10_000);
    await deliver(fx, await onDelivery(fx, 2500));
    expect(await balanceOf(fx)).toBe(2500);
  });

  it("hides a courier of another branch", async () => {
    const fx = await funded(10_000);
    const other = await newFixture();
    await expect(
      earnings.recordWithdrawal({
        courierId: fx.courierId,
        branchId: other.branchId,
        adminId: other.users.branch_admin,
        amount: 1000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(earnings.branchCourierHistory(fx.courierId, other.branchId, { limit: 20 })).rejects.toMatchObject({ status: 404 });
    expect(await balanceOf(fx)).toBe(10_000);
  });
});

describe("history", () => {
  it("pages newest first and returns every entry once", async () => {
    const fx = await funded(10_000);
    for (const amount of [100, 200, 300, 400]) await withdraw(fx, amount);

    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await earnings.courierHistory(fx.courierId, { cursor, limit: 2 });
      seen.push(...page.entries.map((e) => e.amount));
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([-400, -300, -200, -100, 10_000]);
  });
});

describe("HTTP access", () => {
  let fx: Fixture;
  let other: Fixture;
  let base: string;
  let close: () => void;

  const bearer = (sub: string, role: string, branchId: string | null) => ({
    Authorization: `Bearer ${jwt.sign({ sub, role, branch_id: branchId }, env.JWT_ACCESS_SECRET)}`,
    "Content-Type": "application/json",
  });
  const withdrawAs = (headers: Record<string, string>, body: unknown = { amount: 1000, idempotency_key: randomUUID() }) =>
    fetch(`${base}/admin/couriers/${fx.courierId}/withdrawals`, { method: "POST", headers, body: JSON.stringify(body) });

  beforeAll(async () => {
    fx = await funded(10_000);
    other = await newFixture();
    const server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    close = () => server.close();
  });

  afterAll(() => close());

  it("lets the courier read their balance and history, and refuses a customer", async () => {
    const headers = bearer(fx.courierId, "courier", null);
    expect(await (await fetch(`${base}/courier/balance`, { headers })).json()).toEqual({ balance: 10_000 });
    const history = (await (await fetch(`${base}/courier/balance/history`, { headers })).json()) as { entries: unknown[] };
    expect(history.entries).toHaveLength(1);
    const asCustomer = await fetch(`${base}/courier/balance`, { headers: bearer(fx.users.customer, "customer", null) });
    expect(asCustomer.status).toBe(403);
  });

  it("lets the branch admin record a withdrawal and see it in the courier list", async () => {
    const headers = bearer(fx.users.branch_admin, "branch_admin", fx.branchId);
    const res = await withdrawAs(headers);
    expect(res.status).toBe(200);
    const list = (await (await fetch(`${base}/admin/couriers`, { headers })).json()) as {
      couriers: { user_id: string; balance: number }[];
    };
    expect(list.couriers.find((c) => c.user_id === fx.courierId)?.balance).toBe(9000);
  });

  it("lets super_admin view but not record", async () => {
    const headers = bearer(fx.users.super_admin, "super_admin", null);
    const ledger = await fetch(`${base}/admin/couriers/${fx.courierId}/ledger?branch_id=${fx.branchId}`, { headers });
    expect(ledger.status).toBe(200);
    expect((await withdrawAs(headers)).status).toBe(403);
  });

  it("refuses the courier, another branch's admin, and bad amounts", async () => {
    expect((await withdrawAs(bearer(fx.courierId, "courier", null))).status).toBe(403);
    expect((await withdrawAs(bearer(other.users.branch_admin, "branch_admin", other.branchId))).status).toBe(404);
    const admin = bearer(fx.users.branch_admin, "branch_admin", fx.branchId);
    for (const amount of [0, -500, 10.5]) {
      expect((await withdrawAs(admin, { amount, idempotency_key: randomUUID() })).status).toBe(400);
    }
  });
});
