import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type {
  AdminProduct,
  AdminProductsResponse,
  CatalogProduct,
  CatalogResponse,
  CreateBranchResponse,
  SuperBranchesResponse,
} from "@2m/shared";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { pool, withTransaction } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, giveStock, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import * as counters from "../../src/modules/inventory/counters";
import { insertReservations } from "../../src/modules/inventory/repo";

let fx: Fixture;
let other: Fixture;
let productId: string;
let base: string;
let close: () => void;

const bearer = (sub: string, role: string, branchId: string | null) => ({
  Authorization: `Bearer ${jwt.sign({ sub, role, branch_id: branchId }, env.JWT_ACCESS_SECRET)}`,
  "Content-Type": "application/json",
});
const asAdmin = () => bearer(fx.users.branch_admin, "branch_admin", fx.branchId);
const asSuper = () => bearer(fx.users.super_admin, "super_admin", null);
const call = (path: string, init: { method?: string; headers: Record<string, string>; body?: unknown }) =>
  fetch(`${base}${path}`, { method: init.method ?? "GET", headers: init.headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

async function addProduct(branchId: string, price = 10_000): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const id = (
    await pool.query(
      `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $2, 'pcs', 'test', 1) RETURNING id`,
      [`T-${tag}`, `Produk ${tag}`],
    )
  ).rows[0].id as string;
  await pool.query(`INSERT INTO branch_products (branch_id, product_id, price) VALUES ($1, $2, $3)`, [branchId, id, price]);
  return id;
}

// An order row only to hang reservations on: stock_reservations references orders.
async function holdUnits(qty: number): Promise<string> {
  const orderId = await insertOrder(pool, fx, "PENDING_PAYMENT");
  await withTransaction((tx) =>
    insertReservations(tx, { orderId, ttlSec: 600, items: [{ branchId: fx.branchId, productId, qty }] }),
  );
  return orderId;
}

beforeAll(async () => {
  fx = await createFixture(pool);
  other = await createFixture(pool);
  // Only fx's branch is a complete template; other's has no pricing or limits.
  await pool.query(
    `INSERT INTO branch_pricing_config (branch_id, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order)
     VALUES ($1, 5000, 2000, 1, 20, 500, 0, 30000, 20000)`,
    [fx.branchId],
  );
  await pool.query(
    `INSERT INTO branch_limits (branch_id, max_qty_per_sku_default, max_order_weight_kg, heavy_order_threshold_kg) VALUES ($1, 20, 80, 40)`,
    [fx.branchId],
  );
  productId = await addProduct(fx.branchId);
  await giveStock(pool, fx.branchId, productId, 10);
  const server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  close = () => server.close();
});

afterAll(async () => {
  close();
  await pool.end();
  await closeRedis();
});

describe("products", () => {
  it("lists hidden products too, scoped to the admin's branch", async () => {
    await pool.query(`UPDATE branch_products SET is_active = false WHERE product_id = $1`, [productId]);
    const list = await json<AdminProductsResponse>(await call("/admin/products", { headers: asAdmin() }));
    expect(list.products.map((p) => p.id)).toContain(productId);
    expect(list.products.find((p) => p.id === productId)).toMatchObject({ is_active: false, sellable_qty: 10 });
    await pool.query(`UPDATE branch_products SET is_active = true WHERE product_id = $1`, [productId]);

    const theirs = await json<AdminProductsResponse>(
      await call("/admin/products", { headers: bearer(other.users.branch_admin, "branch_admin", other.branchId) }),
    );
    expect(theirs.products.map((p) => p.id)).not.toContain(productId);
  });

  it("updates this branch's price and visibility, and audits it", async () => {
    const res = await call(`/admin/products/${productId}`, {
      method: "PATCH",
      headers: asAdmin(),
      body: { price: 12_500, is_active: false },
    });
    expect(res.status).toBe(200);
    expect(await json<AdminProduct>(res)).toMatchObject({ price: 12_500, is_active: false });
    const audits = await pool.query(`SELECT 1 FROM audit_logs WHERE action = 'PRODUCT_UPDATED' AND entity_id = $1`, [productId]);
    expect(audits.rowCount).toBe(1);
  });

  it("refuses product details from the branch screen: they belong to the catalogue", async () => {
    const res = await call(`/admin/products/${productId}`, { method: "PATCH", headers: asAdmin(), body: { price: 13_000, name: "Ganti" } });
    expect(res.status).toBe(400);
  });

  it("sets sellable stock while keeping units held by orders, in Postgres and Redis", async () => {
    await holdUnits(3);
    const res = await call(`/admin/products/${productId}`, { method: "PATCH", headers: asAdmin(), body: { sellable_qty: 25 } });
    expect(res.status).toBe(200);
    expect((await json<AdminProduct>(res)).sellable_qty).toBe(25);
    const snap = await pool.query(`SELECT qty FROM stock_snapshots WHERE branch_id = $1 AND product_id = $2`, [fx.branchId, productId]);
    expect(snap.rows[0].qty).toBe(28);
    expect(await counters.readCounter(fx.branchId, productId)).toBe(25);
  });

  it("refuses another branch's product, empty bodies and bad values", async () => {
    const foreign = await addProduct(other.branchId);
    expect((await call(`/admin/products/${foreign}`, { method: "PATCH", headers: asAdmin(), body: { price: 1000 } })).status).toBe(404);
    expect((await call(`/admin/products/${productId}`, { method: "PATCH", headers: asAdmin(), body: {} })).status).toBe(400);
    for (const body of [{ price: 0 }, { price: 10.5 }, { sellable_qty: -1 }, { weight_kg: 0 }]) {
      expect((await call(`/admin/products/${productId}`, { method: "PATCH", headers: asAdmin(), body })).status).toBe(400);
    }
    const courier = bearer(fx.courierId, "courier", fx.branchId);
    expect((await call("/admin/products", { headers: courier })).status).toBe(403);
  });
});

describe("adding catalogue products to a branch", () => {
  it("lists only products the branch does not sell, then adds one with price and stock", async () => {
    const foreign = await addProduct(other.branchId);
    // Searched by SKU: the list is paged and a shared test database holds many products.
    const search = async (id: string) => {
      const { sku } = (await pool.query(`SELECT sku FROM products WHERE id = $1`, [id])).rows[0] as { sku: string };
      const res = await call(`/admin/products/available?q=${sku}`, { headers: asAdmin() });
      return (await json<CatalogResponse>(res)).products.map((p) => p.id);
    };
    expect(await search(foreign)).toContain(foreign);
    expect(await search(productId)).not.toContain(productId);

    const res = await call("/admin/products", {
      method: "POST",
      headers: asAdmin(),
      body: { product_id: foreign, price: 9_000, sellable_qty: 12 },
    });
    expect(res.status).toBe(201);
    expect(await json<AdminProduct>(res)).toMatchObject({ id: foreign, price: 9_000, sellable_qty: 12, is_active: true });
    expect(await counters.readCounter(fx.branchId, foreign)).toBe(12);
    // The other branch keeps its own price.
    const theirs = await pool.query(`SELECT price FROM branch_products WHERE branch_id = $1 AND product_id = $2`, [other.branchId, foreign]);
    expect(theirs.rows[0].price).toBe(10_000);

    const again = await call("/admin/products", { method: "POST", headers: asAdmin(), body: { product_id: foreign, price: 9_000, sellable_qty: 1 } });
    expect(again.status).toBe(409);
  });

  it("rejects an unknown product", async () => {
    const res = await call("/admin/products", { method: "POST", headers: asAdmin(), body: { product_id: randomUUID(), price: 1000, sellable_qty: 0 } });
    expect(res.status).toBe(404);
  });
});

describe("catalogue (super_admin)", () => {
  const sku = () => `NEW-${randomUUID().slice(0, 6).toUpperCase()}`;

  it("creates a SKU, edits its details for every branch, and filters by branch", async () => {
    const code = sku();
    const created = await call("/admin/catalog", {
      method: "POST",
      headers: asSuper(),
      body: { sku: code.toLowerCase(), name: "Minyak Uji 1 L", unit: "botol", category: "Minyak", weight_kg: 0.9 },
    });
    expect(created.status).toBe(201);
    const product = await json<CatalogProduct>(created);
    expect(product).toMatchObject({ sku: code, category: "minyak", branches: [] });

    expect((await call("/admin/catalog", { method: "POST", headers: asSuper(), body: { sku: code, name: "x", unit: "x", category: "x", weight_kg: 1 } })).status).toBe(409);

    await call("/admin/products", { method: "POST", headers: asAdmin(), body: { product_id: product.id, price: 20_000, sellable_qty: 5 } });
    const edited = await call(`/admin/catalog/${product.id}`, { method: "PATCH", headers: asSuper(), body: { name: "Minyak Uji 1 Liter" } });
    expect(edited.status).toBe(200);
    expect(await json<CatalogProduct>(edited)).toMatchObject({ name: "Minyak Uji 1 Liter", branches: [{ id: fx.branchId }] });

    const sold = await json<CatalogResponse>(
      await call(`/admin/catalog?filter_branch_id=${fx.branchId}&availability=sold&q=${code}`, { headers: asSuper() }),
    );
    expect(sold.products.map((p) => p.id)).toEqual([product.id]);
    const notSold = await json<CatalogResponse>(
      await call(`/admin/catalog?filter_branch_id=${other.branchId}&availability=not_sold&q=${code}`, { headers: asSuper() }),
    );
    expect(notSold.products.map((p) => p.id)).toEqual([product.id]);
  });

  it("is closed to branch admins and rejects a bad SKU", async () => {
    expect((await call("/admin/catalog", { headers: asAdmin() })).status).toBe(403);
    expect((await call(`/admin/catalog/${productId}`, { method: "PATCH", headers: asAdmin(), body: { name: "x" } })).status).toBe(403);
    const bad = await call("/admin/catalog", { method: "POST", headers: asSuper(), body: { sku: "a b", name: "x", unit: "x", category: "x", weight_kg: 1 } });
    expect(bad.status).toBe(400);
  });
});

describe("branch location", () => {
  it("lets the branch admin move the branch and change the radius, not open or close it", async () => {
    const res = await call("/admin/branch", { method: "PATCH", headers: asAdmin(), body: { lat: -6.25, lng: 106.85, service_radius_m: 7000 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ lat: -6.25, lng: 106.85, service_radius_m: 7000 });
    expect((await call("/admin/branch", { method: "PATCH", headers: asAdmin(), body: { is_active: false } })).status).toBe(403);
    expect((await call("/admin/branch", { method: "PATCH", headers: asAdmin(), body: { lat: -6.3 } })).status).toBe(400);
  });

  it("lets super_admin edit any branch by id", async () => {
    const res = await call("/admin/branch", { method: "PATCH", headers: asSuper(), body: { branch_id: other.branchId, name: "Cabang Lain" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: other.branchId, name: "Cabang Lain" });
  });
});

describe("new branch accounts", () => {
  const newBranch = (phone: string) => ({
    name: `Cabang ${phone}`,
    lat: -6.3,
    lng: 106.9,
    service_radius_m: 4000,
    template_branch_id: fx.branchId,
    admin: { name: "Admin Baru", phone, password: "rahasia123" },
  });
  const phone = () => `0819${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  it("creates an inactive branch with copied pricing, limits and products, no stock, and an admin who can log in", async () => {
    const p = phone();
    const res = await call("/admin/branches", { method: "POST", headers: asSuper(), body: newBranch(p) });
    expect(res.status).toBe(201);
    const { branch } = await json<CreateBranchResponse>(res);
    expect(branch).toMatchObject({ is_active: false, service_radius_m: 4000 });
    expect(branch.admins).toEqual([expect.objectContaining({ phone: p, is_active: true })]);
    expect(branch.product_count).toBeGreaterThan(0);

    const copied = await pool.query(
      `SELECT (SELECT count(*)::int FROM branch_pricing_config WHERE branch_id = $1) AS pricing,
              (SELECT count(*)::int FROM branch_limits WHERE branch_id = $1) AS limits,
              (SELECT count(*)::int FROM stock_snapshots WHERE branch_id = $1) AS stock`,
      [branch.id],
    );
    expect(copied.rows[0]).toEqual({ pricing: 1, limits: 1, stock: 0 });

    const login = await call("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: { identifier: p, password: "rahasia123" } });
    expect(login.status).toBe(200);
    expect((await json<{ user: { role: string; branch_id: string } }>(login)).user).toMatchObject({ role: "branch_admin", branch_id: branch.id });

    const all = await json<SuperBranchesResponse>(await call("/admin/branches", { headers: asSuper() }));
    expect(all.branches.map((b) => b.id)).toContain(branch.id);
  });

  it("adds a second admin to a branch and rejects a phone already in use", async () => {
    const p = phone();
    expect((await call(`/admin/branches/${fx.branchId}/admins`, { method: "POST", headers: asSuper(), body: { name: "Admin Dua", phone: p, password: "rahasia123" } })).status).toBe(201);
    const dup = await call("/admin/branches", { method: "POST", headers: asSuper(), body: newBranch(p) });
    expect(dup.status).toBe(409);
    expect(await pool.query(`SELECT 1 FROM branches WHERE name = $1`, [`Cabang ${p}`]).then((r) => r.rowCount)).toBe(0);
  });

  it("refuses a branch admin and a template without pricing", async () => {
    expect((await call("/admin/branches", { method: "POST", headers: asAdmin(), body: newBranch(phone()) })).status).toBe(403);
    expect((await call("/admin/branches", { headers: asAdmin() })).status).toBe(403);
    const res = await call("/admin/branches", { method: "POST", headers: asSuper(), body: { ...newBranch(phone()), template_branch_id: other.branchId } });
    expect(res.status).toBe(409);
  });
});
