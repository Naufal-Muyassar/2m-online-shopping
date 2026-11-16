import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "../../src/shared/db";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { transition } from "../../src/modules/orders/service";
import { settleFromInvoice } from "../../src/modules/payments/service";
import * as refunds from "../../src/modules/refunds/service";

let fx: Fixture;
let otherCustomer: string;
const admin = () => ({ id: fx.users.branch_admin, role: "branch_admin" });

beforeAll(async () => {
  fx = await createFixture(pool);
  otherCustomer = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash) VALUES ('customer', 'other', $1, 'x') RETURNING id`,
      [`t-o-${randomUUID().slice(0, 8)}`],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

const refundsOf = async (orderId: string) =>
  (await pool.query(`SELECT id, reason, amount, status FROM refunds WHERE order_id = $1 ORDER BY created_at`, [orderId])).rows;

async function paidOrder(status: "PAID" | "ACCEPTED" | "DELIVERED" = "PAID"): Promise<{ id: string; code: string }> {
  const id = await insertOrder(pool, fx, status);
  await pool.query(
    `INSERT INTO order_state_transitions (order_id, branch_id, from_status, to_status, actor_role)
     VALUES ($1, $2, 'PENDING_PAYMENT', 'PAID', 'system')`,
    [id, fx.branchId],
  );
  const code = (await pool.query(`SELECT code FROM orders WHERE id = $1`, [id])).rows[0].code as string;
  return { id, code };
}

const cancel = (orderId: string) =>
  withTransaction((tx) =>
    transition(tx, { orderId, to: "CANCELLED", actor: { id: fx.users.branch_admin, role: "branch_admin" }, meta: { reason: "STOK_HABIS" } }),
  );

async function uploadReceipt(refundId: string): Promise<string> {
  const { proof_key, upload_url } = await refunds.proofUploadUrl(refundId, fx.branchId);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const put = await fetch(upload_url, { method: "PUT", body: jpeg, headers: { "Content-Type": "image/jpeg" } });
  expect(put.ok).toBe(true);
  return proof_key;
}

const destination = { method: "BANK" as const, provider: "BCA", account_no: "1234567890", account_name: "Budi" };

describe("refunds opened by the system", () => {
  it("opens one full refund when a paid order is cancelled, in the same transaction", async () => {
    const { id } = await paidOrder();
    await cancel(id);
    expect(await refundsOf(id)).toMatchObject([{ reason: "ORDER_CANCELLED", amount: 10000, status: "NEEDS_DESTINATION" }]);
    // A replay of the cause (redelivery, retry) finds the refund it opened.
    await withTransaction((tx) => refunds.onTransition(tx, { orderId: id, from: "PAID", to: "CANCELLED" }));
    expect(await refundsOf(id)).toHaveLength(1);
  });

  it("opens nothing when an unpaid order is cancelled", async () => {
    const id = await insertOrder(pool, fx, "PENDING_PAYMENT");
    await withTransaction((tx) =>
      transition(tx, { orderId: id, to: "CANCELLED", actor: { id: null, role: "system" }, meta: { reason: "PAYMENT_EXPIRED" } }),
    );
    expect(await refundsOf(id)).toEqual([]);
  });

  it("refunds the value of items the courier could not pick", async () => {
    const { id } = await paidOrder();
    const productId = (
      await pool.query(`INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, 'x', 'pcs', 'test', 1) RETURNING id`, [
        `R-${randomUUID().slice(0, 8)}`,
      ])
    ).rows[0].id;
    await pool.query(
      `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg, picked_qty)
       VALUES ($1, $2, $3, 'x', 'x', 4, 1500, 1, 1)`,
      [id, fx.branchId, productId],
    );
    await withTransaction((tx) => refunds.onTransition(tx, { orderId: id, from: "PICKING", to: "ON_DELIVERY" }));
    await withTransaction((tx) => refunds.onTransition(tx, { orderId: id, from: "PICKING", to: "ON_DELIVERY" }));
    expect(await refundsOf(id)).toMatchObject([{ reason: "ITEM_SHORTAGE", amount: 4500 }]);
  });

  it("opens a refund once for a payment that lands on a cancelled order", async () => {
    const id = await insertOrder(pool, fx, "CANCELLED");
    const code = `ORD-261116-${randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase()}`;
    const invoiceId = `inv-${randomUUID()}`;
    await pool.query(`UPDATE orders SET code = $2, invoice_id = $3 WHERE id = $1`, [id, code, invoiceId]);
    const invoice = {
      id: invoiceId,
      externalId: `${code}-1`,
      status: "PAID" as const,
      amount: 10000,
      paidAmount: 10000,
      feesPaidAmount: null,
      invoiceUrl: "https://example.test/i",
      expiresAt: new Date().toISOString(),
    };
    await settleFromInvoice(invoice as never);
    await settleFromInvoice(invoice as never);
    expect(await refundsOf(id)).toMatchObject([{ reason: "LATE_PAYMENT", amount: 10000 }]);
  });
});

describe("manual refunds", () => {
  it("never lets concurrent refunds exceed the order total", async () => {
    const { code, id } = await paidOrder("DELIVERED");
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        refunds.createManual({ branchId: fx.branchId, admin: admin(), orderCode: code, amount: 3000, note: "barang rusak", idempotencyKey: randomUUID() }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "REFUND_EXCEEDS_ORDER" });
    expect(ok).toHaveLength(3);
    const total = (await refundsOf(id)).reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(9000);
  });

  it("replays a retried request and refuses the same key for a different refund", async () => {
    const { code } = await paidOrder("DELIVERED");
    const key = randomUUID();
    const input = { branchId: fx.branchId, admin: admin(), orderCode: code, amount: 2000, note: "kemasan bocor", idempotencyKey: key };
    const [a, b] = await Promise.all([refunds.createManual(input), refunds.createManual(input)]);
    expect(b.id).toBe(a.id);
    await expect(refunds.createManual({ ...input, amount: 2500 })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("refuses an order that was never paid or belongs to another branch", async () => {
    const id = await insertOrder(pool, fx, "CANCELLED");
    const code = (await pool.query(`SELECT code FROM orders WHERE id = $1`, [id])).rows[0].code;
    const input = { branchId: fx.branchId, admin: admin(), orderCode: code, amount: 1000, note: "coba", idempotencyKey: randomUUID() };
    await expect(refunds.createManual(input)).rejects.toMatchObject({ code: "ORDER_NOT_PAID" });
    const other = await createFixture(pool);
    await expect(refunds.createManual({ ...input, branchId: other.branchId })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});

describe("paying a refund out", () => {
  it("needs the customer's account, then a receipt; completes once and shows the customer the proof", async () => {
    const { id } = await paidOrder();
    await cancel(id);
    const [{ id: refundId }] = await refundsOf(id);

    const key = await uploadReceipt(refundId);
    const complete = (proofKey: string) =>
      refunds.completeRefund({ refundId, branchId: fx.branchId, admin: admin(), transferRef: "TRF-001", proofKey });
    await expect(complete(key)).rejects.toMatchObject({ code: "REFUND_NEEDS_DESTINATION" });

    await expect(refunds.setDestination(otherCustomer, id, refundId, destination)).rejects.toMatchObject({ code: "REFUND_NOT_FOUND" });
    await refunds.setDestination(fx.users.customer, id, refundId, destination);

    const results = await Promise.all(Array.from({ length: 5 }, () => complete(key)));
    for (const r of results) expect(r).toMatchObject({ id: refundId, status: "COMPLETED", transfer_ref: "TRF-001" });
    const audits = await pool.query(`SELECT 1 FROM audit_logs WHERE entity_id = $1 AND action = 'REFUND_COMPLETED'`, [refundId]);
    expect(audits.rowCount).toBe(1);

    await expect(complete(await uploadReceipt(refundId).catch(() => `refunds/${refundId}/${randomUUID()}.jpg`))).rejects.toMatchObject({
      code: expect.stringMatching(/REFUND_ALREADY_COMPLETED|PROOF_NOT_UPLOADED/),
    });
    await expect(refunds.setDestination(fx.users.customer, id, refundId, destination)).rejects.toMatchObject({
      code: "REFUND_ALREADY_COMPLETED",
    });

    const [view] = await refunds.customerRefunds(id);
    expect(view).toMatchObject({
      status: "COMPLETED",
      transfer_ref: "TRF-001",
      destination: { provider: "BCA", account_masked: "•••• 7890", account_name: "Budi" },
    });
    expect(view!.proof_url).toMatch(/^http/);
    expect(JSON.stringify(view)).not.toContain("1234567890");
  });

  it("rejects a receipt key that belongs to another refund or was never uploaded", async () => {
    const { id } = await paidOrder();
    await cancel(id);
    const [{ id: refundId }] = await refundsOf(id);
    await refunds.setDestination(fx.users.customer, id, refundId, destination);
    const complete = (proofKey: string) =>
      refunds.completeRefund({ refundId, branchId: fx.branchId, admin: admin(), transferRef: "TRF-002", proofKey });
    await expect(complete(`refunds/${randomUUID()}/${randomUUID()}.jpg`)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(complete(`refunds/${refundId}/${randomUUID()}.jpg`)).rejects.toMatchObject({ code: "PROOF_NOT_UPLOADED" });
  });
});
