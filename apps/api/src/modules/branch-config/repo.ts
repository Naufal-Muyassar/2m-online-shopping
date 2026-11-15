import type { Pool } from "pg";
import type { AdminBranch, AdminProduct, BranchAdminAccount, CatalogProduct, SuperBranch } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { SELLABLE_EXPR, SELLABLE_JOINS } from "../inventory/repo";

type Db = Pool | Tx;

export const ADMIN_PAGE_SIZE = 50;

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const PRODUCT_SELECT = `
  SELECT p.id, p.sku, p.name, p.unit, p.category, p.weight_kg::float8 AS weight_kg, bp.price, bp.is_active,
         GREATEST(${SELLABLE_EXPR}, 0) AS sellable_qty
  FROM branch_products bp JOIN products p ON p.id = bp.product_id${SELLABLE_JOINS}`;

export async function listBranchProducts(
  db: Db,
  branchId: string,
  opts: { q?: string; page: number },
): Promise<{ rows: AdminProduct[]; hasMore: boolean }> {
  const params: unknown[] = [branchId];
  let where = "bp.branch_id = $1";
  if (opts.q) {
    params.push(`%${escapeLike(opts.q)}%`);
    where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
  }
  params.push(ADMIN_PAGE_SIZE + 1, (opts.page - 1) * ADMIN_PAGE_SIZE);
  const res = await db.query<AdminProduct>(
    `${PRODUCT_SELECT}
     WHERE ${where}
     ORDER BY p.category, bp.display_order, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: res.rows.slice(0, ADMIN_PAGE_SIZE), hasMore: res.rows.length > ADMIN_PAGE_SIZE };
}

export async function getBranchProduct(db: Db, branchId: string, productId: string): Promise<AdminProduct | null> {
  const res = await db.query<AdminProduct>(`${PRODUCT_SELECT} WHERE bp.branch_id = $1 AND bp.product_id = $2`, [
    branchId,
    productId,
  ]);
  return res.rows[0] ?? null;
}

// Every category in the shared catalogue, so an edit can reuse one instead of inventing a spelling.
export async function listAllCategories(db: Db): Promise<string[]> {
  const res = await db.query<{ category: string }>(`SELECT DISTINCT category FROM products ORDER BY category`);
  return res.rows.map((r) => r.category);
}

export async function lockBranchProduct(tx: Tx, branchId: string, productId: string): Promise<boolean> {
  const res = await tx.query(`SELECT 1 FROM branch_products WHERE branch_id = $1 AND product_id = $2 FOR UPDATE`, [
    branchId,
    productId,
  ]);
  return res.rowCount === 1;
}

const CATALOG_SELECT = `
  SELECT p.id, p.sku, p.name, p.unit, p.category, p.weight_kg::float8 AS weight_kg,
         COALESCE(
           (SELECT json_agg(json_build_object('id', b.id, 'name', b.name) ORDER BY b.name)
            FROM branch_products bp JOIN branches b ON b.id = bp.branch_id WHERE bp.product_id = p.id),
           '[]'::json) AS branches
  FROM products p`;

export async function listCatalog(
  db: Db,
  opts: { q?: string; branchId?: string; availability?: "sold" | "not_sold"; page: number },
): Promise<{ rows: CatalogProduct[]; hasMore: boolean }> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.q) {
    params.push(`%${escapeLike(opts.q)}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }
  if (opts.branchId && opts.availability) {
    params.push(opts.branchId);
    const sold = `EXISTS (SELECT 1 FROM branch_products x WHERE x.product_id = p.id AND x.branch_id = $${params.length})`;
    where.push(opts.availability === "sold" ? sold : `NOT ${sold}`);
  }
  params.push(ADMIN_PAGE_SIZE + 1, (opts.page - 1) * ADMIN_PAGE_SIZE);
  const res = await db.query<CatalogProduct>(
    `${CATALOG_SELECT}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY p.category, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: res.rows.slice(0, ADMIN_PAGE_SIZE), hasMore: res.rows.length > ADMIN_PAGE_SIZE };
}

export async function getCatalogProduct(db: Db, productId: string): Promise<CatalogProduct | null> {
  const res = await db.query<CatalogProduct>(`${CATALOG_SELECT} WHERE p.id = $1`, [productId]);
  return res.rows[0] ?? null;
}

export async function insertCatalogProduct(
  tx: Tx,
  f: { sku: string; name: string; unit: string; category: string; weight_kg: number },
): Promise<string> {
  const res = await tx.query<{ id: string }>(
    `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [f.sku, f.name, f.unit, f.category, f.weight_kg],
  );
  return res.rows[0]!.id;
}

export async function updateCatalogProduct(
  tx: Tx,
  productId: string,
  f: { name?: string; unit?: string; category?: string; weight_kg?: number },
): Promise<void> {
  await tx.query(
    `UPDATE products SET name = COALESCE($2, name), unit = COALESCE($3, unit), category = COALESCE($4, category),
            weight_kg = COALESCE($5, weight_kg)
     WHERE id = $1`,
    [productId, f.name ?? null, f.unit ?? null, f.category ?? null, f.weight_kg ?? null],
  );
}

// A new product goes to the end of the branch's list. False when the branch already has it.
export async function insertBranchProduct(
  tx: Tx,
  f: { branchId: string; productId: string; price: number; isActive: boolean },
): Promise<boolean> {
  const res = await tx.query(
    `INSERT INTO branch_products (branch_id, product_id, price, is_active, display_order)
     SELECT $1, $2, $3, $4, COALESCE(max(display_order) + 1, 0) FROM branch_products WHERE branch_id = $1
     ON CONFLICT (branch_id, product_id) DO NOTHING`,
    [f.branchId, f.productId, f.price, f.isActive],
  );
  return res.rowCount === 1;
}

export async function updateBranchProduct(
  tx: Tx,
  branchId: string,
  productId: string,
  f: { price?: number; is_active?: boolean },
): Promise<void> {
  await tx.query(
    `UPDATE branch_products SET price = COALESCE($3, price), is_active = COALESCE($4, is_active)
     WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId, f.price ?? null, f.is_active ?? null],
  );
}

const BRANCH_COLUMNS = "b.id, b.name, b.lat, b.lng, b.service_radius_m, b.is_active";

export async function getBranch(db: Db, branchId: string, opts: { lock?: boolean } = {}): Promise<AdminBranch | null> {
  const res = await db.query<AdminBranch>(
    `SELECT ${BRANCH_COLUMNS} FROM branches b WHERE b.id = $1${opts.lock ? " FOR UPDATE" : ""}`,
    [branchId],
  );
  return res.rows[0] ?? null;
}

export async function updateBranch(
  tx: Tx,
  branchId: string,
  f: { name?: string; lat?: number; lng?: number; service_radius_m?: number; is_active?: boolean },
): Promise<void> {
  await tx.query(
    `UPDATE branches SET name = COALESCE($2, name), lat = COALESCE($3, lat), lng = COALESCE($4, lng),
            service_radius_m = COALESCE($5, service_radius_m), is_active = COALESCE($6, is_active), updated_at = now()
     WHERE id = $1`,
    [branchId, f.name ?? null, f.lat ?? null, f.lng ?? null, f.service_radius_m ?? null, f.is_active ?? null],
  );
}

export async function listAllBranches(db: Db, onlyId?: string): Promise<SuperBranch[]> {
  const res = await db.query<SuperBranch>(
    `SELECT ${BRANCH_COLUMNS},
            (SELECT count(*)::int FROM branch_products bp WHERE bp.branch_id = b.id) AS product_count,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email,
                                                 'is_active', u.is_active) ORDER BY u.created_at)
               FROM users u WHERE u.branch_id = b.id AND u.role = 'branch_admin'),
              '[]'::json) AS admins
     FROM branches b
     WHERE ($1::uuid IS NULL OR b.id = $1)
     ORDER BY b.is_active DESC, b.name`,
    [onlyId ?? null],
  );
  return res.rows;
}

export async function insertBranch(
  tx: Tx,
  b: { name: string; lat: number; lng: number; serviceRadiusM: number; isActive: boolean; templateId: string },
): Promise<string | null> {
  // Opening hours, timezone and courier capacity follow the template.
  const res = await tx.query<{ id: string }>(
    `INSERT INTO branches (name, lat, lng, service_radius_m, is_active, open_hours, timezone, courier_capacity)
     SELECT $1, $2, $3, $4, $5, t.open_hours, t.timezone, t.courier_capacity FROM branches t WHERE t.id = $6
     RETURNING id`,
    [b.name, b.lat, b.lng, b.serviceRadiusM, b.isActive, b.templateId],
  );
  return res.rows[0]?.id ?? null;
}

// Copies the template's rows with the new branch id, whatever columns later migrations add.
async function copyRows(tx: Tx, table: string, newId: string, templateId: string): Promise<number> {
  const res = await tx.query(
    `INSERT INTO ${table}
     SELECT (jsonb_populate_record(NULL::${table}, to_jsonb(t) || jsonb_build_object('branch_id', $1::uuid))).*
     FROM ${table} t WHERE t.branch_id = $2`,
    [newId, templateId],
  );
  return res.rowCount ?? 0;
}

export const copyPricingConfig = (tx: Tx, newId: string, templateId: string) =>
  copyRows(tx, "branch_pricing_config", newId, templateId);
export const copyLimits = (tx: Tx, newId: string, templateId: string) => copyRows(tx, "branch_limits", newId, templateId);
// Prices, visibility, order and buffer come along; stock does not (no snapshot row means no stock).
export const copyProducts = (tx: Tx, newId: string, templateId: string) => copyRows(tx, "branch_products", newId, templateId);

export async function insertBranchAdmin(
  tx: Tx,
  a: { branchId: string; name: string; phone: string; email: string | null; passwordHash: string },
): Promise<BranchAdminAccount> {
  const res = await tx.query<BranchAdminAccount>(
    `INSERT INTO users (role, name, phone, email, password_hash, branch_id)
     VALUES ('branch_admin', $1, $2, $3, $4, $5)
     RETURNING id, name, phone, email, is_active`,
    [a.name, a.phone, a.email, a.passwordHash, a.branchId],
  );
  return res.rows[0]!;
}
