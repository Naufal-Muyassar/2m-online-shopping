import type { Pool } from "pg";
import type { Branch } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { SELLABLE_EXPR, SELLABLE_JOINS } from "../inventory/repo";

type Db = Pool | Tx;

export const PAGE_SIZE = 20;

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  weight_kg: number;
  price: number;
  sellable_qty: number;
}

export async function listActiveBranches(db: Db): Promise<Branch[]> {
  const res = await db.query<Branch>(
    "SELECT id, name, lat, lng, service_radius_m FROM branches WHERE is_active ORDER BY name",
  );
  return res.rows;
}

export async function branchIsActive(db: Db, branchId: string): Promise<boolean> {
  const res = await db.query("SELECT 1 FROM branches WHERE id = $1 AND is_active", [branchId]);
  return res.rowCount === 1;
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listProducts(
  db: Db,
  branchId: string,
  opts: { category?: string; q?: string; page: number },
): Promise<{ rows: ProductRow[]; hasMore: boolean }> {
  const params: unknown[] = [branchId];
  let where = "bp.branch_id = $1 AND bp.is_active";
  if (opts.category) {
    params.push(opts.category);
    where += ` AND p.category = $${params.length}`;
  }
  if (opts.q) {
    params.push(`%${escapeLike(opts.q)}%`);
    where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`;
  }
  params.push(PAGE_SIZE + 1, (opts.page - 1) * PAGE_SIZE);
  const res = await db.query<ProductRow>(
    `SELECT p.id, p.sku, p.name, p.unit, p.category, p.weight_kg::float8 AS weight_kg, bp.price,
            GREATEST(${SELLABLE_EXPR}, 0) AS sellable_qty
     FROM branch_products bp JOIN products p ON p.id = bp.product_id${SELLABLE_JOINS}
     WHERE ${where}
     ORDER BY bp.display_order, p.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: res.rows.slice(0, PAGE_SIZE), hasMore: res.rows.length > PAGE_SIZE };
}

export async function listCategories(db: Db, branchId: string): Promise<string[]> {
  const res = await db.query<{ category: string }>(
    `SELECT DISTINCT p.category FROM branch_products bp JOIN products p ON p.id = bp.product_id
     WHERE bp.branch_id = $1 AND bp.is_active ORDER BY p.category`,
    [branchId],
  );
  return res.rows.map((r) => r.category);
}
