import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AdminOrdersResponse, AdminProductsResponse, UpdateBranchAdminResponse } from "@2m/shared";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { pool, withTransaction } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, giveStock, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { computeSellable, insertReservations } from "../../src/modules/inventory/repo";
import { releaseCancelled } from "../../src/modules/inventory/service";

let fx: Fixture;
let other: Fixture;
let base: string;
let close: () => void;

const bearer = (sub: string, role: string, branchId: string | null) => ({
  Authorization: `Bearer ${jwt.sign({ sub, role, branch_id: branchId }, env.JWT_ACCESS_SECRET)}`,
  "Content-Type": "application/json",
});
const asAdmin = () => bearer(fx.users.branch_admin, "branch_admin", fx.branchId);
const asSuper = () => bearer(fx.users.super_admin, "super_admin", null);
const call = (path: string, init: { method?: string; headers: Record<string, string>; body?: unknown }) =>
  fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

async function addProduct(branchId: string, opts: { category?: string; stock?: number; active?: boolean } = {}): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const id = (
    await pool.query(`INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $2, 'pcs', $3, 1) RETURNING id`, [
      `T-${tag}`,
      `Produk ${tag}`,
      opts.category ?? "test",
    ])
  ).rows[0].id as string;
  await pool.query(`INSERT INTO branch_products (branch_id, product_id, price, is_active) VALUES ($1, $2, 1000, $3)`, [
    branchId,
    id,
    opts.active ?? true,
  ]);
  if (opts.stock !== undefined) await giveStock(pool, branchId, id, opts.stock);
  return id;
}

beforeAll(async () => {
  fx = await createFixture(pool);
  other = await createFixture(pool);
  const server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  close = () => server.close();
});

afterAll(async () => {
  close();
  await pool.end();
  await closeRedis();
});

describe("cancelling an order from the board", () => {
  const cancel = (orderId: string, headers: Record<string, string>, body: Record<string, unknown> = { reason: "Stok rusak" }) =>
    call(`/admin/orders/${orderId}/cancel`, { method: "POST", headers, body });

  it("lets the branch admin cancel a paid order and gives its sold stock back", async () => {
    const productId = await addProduct(fx.branchId, { stock: 10 });
    const orderId = await insertOrder(pool, fx, "PAID");
    await withTransaction((tx) =>
      insertReservations(tx, { orderId, ttlSec: 600, items: [{ branchId: fx.branchId, productId, qty: 2 }] }),
    );
    await pool.query(`UPDATE stock_reservations SET status = 'COMMITTED' WHERE order_id = $1`, [orderId]);

    const res = await cancel(orderId, asAdmin());
    expect(res.status).toBe(200);
    const order = await pool.query(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    expect(order.rows[0].status).toBe("CANCELLED");
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'ORDER_CANCEL' AND entity_id = $1`, [orderId]);
    expect(audit.rowCount).toBe(1);

    // The worker runs this on STATUS_CHANGED → CANCELLED.
    expect(await releaseCancelled(orderId)).toBe(1);
    expect(await releaseCancelled(orderId)).toBe(0);
    const [row] = await computeSellable(pool, { branchId: fx.branchId, productIds: [productId] });
    expect(row!.sellable).toBe(10);
  });

  it("needs a reason, and keeps branch admins off orders past ACCEPTED", async () => {
    const paid = await insertOrder(pool, fx, "PAID");
    expect((await cancel(paid, asAdmin(), { reason: " " })).status).toBe(400);
    const picking = await insertOrder(pool, fx, "PICKING");
    expect((await cancel(picking, asAdmin())).status).toBe(403);
    const res = await cancel(picking, asSuper(), { reason: "Pelanggan minta batal", branch_id: fx.branchId });
    expect(res.status).toBe(200);
    // super_admin's cancel of a PICKING order frees its courier.
    const courier = await pool.query(`SELECT status FROM couriers WHERE user_id = $1`, [fx.courierId]);
    expect(courier.rows[0].status).toBe("IDLE");
  });

  it("hides other branches' orders and refuses orders already on the road", async () => {
    const theirs = await insertOrder(pool, other, "PAID");
    expect((await cancel(theirs, asAdmin())).status).toBe(404);
    const onRoad = await insertOrder(pool, fx, "ON_DELIVERY");
    // No ON_DELIVERY → CANCELLED pair exists for anyone.
    expect((await cancel(onRoad, asSuper(), { reason: "Coba batal", branch_id: fx.branchId })).status).toBe(409);
  });
});

describe("board date filter", () => {
  it("returns every order created that day in the branch's timezone, finished ones too", async () => {
    const lateNight = await insertOrder(pool, fx, "DELIVERED");
    // 20:00 UTC on 10 March is 03:00 on 11 March in Jakarta.
    await pool.query(`UPDATE orders SET created_at = '2026-03-10 20:00:00+00', updated_at = '2026-03-10 22:00:00+00' WHERE id = $1`, [
      lateNight,
    ]);
    const ids = async (query: string) =>
      (await json<AdminOrdersResponse>(await call(`/admin/orders${query}`, { headers: asAdmin() }))).orders.map((o) => o.id);

    expect(await ids("?date=2026-03-11")).toEqual([lateNight]);
    expect(await ids("?date=2026-03-10")).not.toContain(lateNight);
    // The live board leaves an old finished order out.
    expect(await ids("")).not.toContain(lateNight);
    expect((await call("/admin/orders?date=11-03-2026", { headers: asAdmin() })).status).toBe(400);
  });
});

describe("product filters and stock summary", () => {
  it("filters by category and stock state and counts the whole branch", async () => {
    const branch = (await createFixture(pool)).branchId;
    const headers = bearer(fx.users.super_admin, "super_admin", null);
    await addProduct(branch, { category: "beras", stock: 50 });
    const low = await addProduct(branch, { category: "beras", stock: 3 });
    const out = await addProduct(branch, { category: "minyak", stock: 0 });
    const hidden = await addProduct(branch, { category: "minyak", stock: 0, active: false });

    const list = async (query: string) =>
      json<AdminProductsResponse>(await call(`/admin/products?branch_id=${branch}${query}`, { headers }));
    const all = await list("");
    expect(all.summary).toEqual({ total: 4, available: 1, low: 1, out: 1, hidden: 1 });
    expect(all.categories).toEqual(["beras", "minyak"]);
    expect((await list("&state=low")).products.map((p) => p.id)).toEqual([low]);
    expect((await list("&state=out")).products.map((p) => p.id)).toEqual([out]);
    expect((await list("&state=hidden")).products.map((p) => p.id)).toEqual([hidden]);
    const minyak = await list("&category=minyak");
    expect(minyak.products).toHaveLength(2);
    // The summary ignores the filters.
    expect(minyak.summary.total).toBe(4);
  });
});

describe("editing a branch admin account", () => {
  async function newAdmin(branchId: string) {
    const phone = `0817${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const id = (
      await pool.query(
        `INSERT INTO users (role, name, phone, password_hash, branch_id) VALUES ('branch_admin', 'Admin Uji', $1, $2, $3) RETURNING id`,
        [phone, await bcrypt.hash("lama12345", 4), branchId],
      )
    ).rows[0].id as string;
    return { id, phone };
  }
  const login = (identifier: string, password: string) =>
    call("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: { identifier, password } });
  const patch = (id: string, body: unknown, headers = asSuper()) =>
    call(`/admin/branch-admins/${id}`, { method: "PATCH", headers, body });

  it("resets the password and signs the admin out", async () => {
    const a = await newAdmin(fx.branchId);
    expect((await login(a.phone, "lama12345")).status).toBe(200);
    const res = await patch(a.id, { password: "baru123456" });
    expect(res.status).toBe(200);
    expect((await login(a.phone, "lama12345")).status).toBe(401);
    expect((await login(a.phone, "baru123456")).status).toBe(200);
    const open = await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`, [a.id]);
    expect(open.rows[0].n).toBe(1);
    const audit = await pool.query(`SELECT after FROM audit_logs WHERE action = 'BRANCH_ADMIN_UPDATED' AND entity_id = $1`, [a.id]);
    expect(JSON.stringify(audit.rows[0].after)).not.toContain("password_hash");
  });

  it("edits name, phone and email, moves the admin and deactivates the account", async () => {
    const a = await newAdmin(fx.branchId);
    const phone = `0818${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const res = await patch(a.id, { name: "Admin Pindah", phone, email: `pindah-${phone}@2m.local`, move_to_branch_id: other.branchId });
    expect(res.status).toBe(200);
    const body = await json<UpdateBranchAdminResponse>(res);
    expect(body).toMatchObject({ branch_id: other.branchId, admin: { name: "Admin Pindah", phone, is_active: true } });

    expect(await json<UpdateBranchAdminResponse>(await patch(a.id, { email: null }))).toMatchObject({ admin: { email: null } });
    await patch(a.id, { is_active: false });
    expect((await login(phone, "lama12345")).status).toBe(401);
  });

  it("refuses a taken phone, a customer account and a branch admin caller", async () => {
    const a = await newAdmin(fx.branchId);
    const b = await newAdmin(fx.branchId);
    expect((await patch(a.id, { phone: b.phone })).status).toBe(409);
    expect((await patch(fx.users.customer, { name: "x" })).status).toBe(404);
    expect((await patch(a.id, { name: "x" }, asAdmin())).status).toBe(403);
    expect((await patch(a.id, {})).status).toBe(400);
    expect((await patch(a.id, { password: "pendek" })).status).toBe(400);
  });
});
