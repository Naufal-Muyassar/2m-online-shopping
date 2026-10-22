import type { Pool } from "pg";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

export interface CartLine {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  weight_kg: number;
  qty: number;
}

export interface BranchLimits {
  max_qty_per_sku: number;
  max_order_weight_kg: number;
  heavy_order_threshold_kg: number;
}

export interface PricingConfig {
  base_fee: number;
  per_km: number;
  free_km: number;
  weight_threshold_kg: number;
  surcharge_per_kg: number;
  fee_min: number;
  fee_max: number;
  min_order: number;
  circuity_factor: number;
}

export async function findCartId(db: Db, userId: string, branchId: string): Promise<string | null> {
  const res = await db.query<{ id: string }>("SELECT id FROM carts WHERE user_id = $1 AND branch_id = $2", [
    userId,
    branchId,
  ]);
  return res.rows[0]?.id ?? null;
}

// The no-op update takes the row lock that serialises concurrent mutations of one cart.
export async function lockOrCreateCart(tx: Tx, userId: string, branchId: string): Promise<string> {
  const res = await tx.query<{ id: string }>(
    `INSERT INTO carts (user_id, branch_id) VALUES ($1, $2)
     ON CONFLICT (user_id, branch_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [userId, branchId],
  );
  return res.rows[0]!.id;
}

// Only lines still sold by the branch; callers compare with countItems to detect delisted products.
export async function getLines(db: Db, cartId: string, branchId: string): Promise<CartLine[]> {
  const res = await db.query<CartLine>(
    `SELECT ci.product_id, p.sku, p.name, p.unit, bp.price, p.weight_kg::float8 AS weight_kg, ci.qty
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN branch_products bp ON bp.product_id = ci.product_id AND bp.branch_id = $2 AND bp.is_active
     WHERE ci.cart_id = $1
     ORDER BY p.name`,
    [cartId, branchId],
  );
  return res.rows;
}

export async function countItems(db: Db, cartId: string): Promise<number> {
  const res = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM cart_items WHERE cart_id = $1", [cartId]);
  return res.rows[0]!.n;
}

export async function getSellableProduct(
  db: Db,
  branchId: string,
  productId: string,
): Promise<{ name: string; weight_kg: number } | null> {
  const res = await db.query<{ name: string; weight_kg: number }>(
    `SELECT p.name, p.weight_kg::float8 AS weight_kg
     FROM branch_products bp JOIN products p ON p.id = bp.product_id
     WHERE bp.branch_id = $1 AND bp.product_id = $2 AND bp.is_active`,
    [branchId, productId],
  );
  return res.rows[0] ?? null;
}

export async function setQty(tx: Tx, cartId: string, branchId: string, productId: string, qty: number): Promise<void> {
  await tx.query(
    `INSERT INTO cart_items (cart_id, branch_id, product_id, qty) VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_id, product_id) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now()`,
    [cartId, branchId, productId, qty],
  );
}

export async function removeItem(tx: Tx, cartId: string, productId: string): Promise<number> {
  const res = await tx.query("DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2", [cartId, productId]);
  return res.rowCount ?? 0;
}

export async function clearCart(tx: Tx, cartId: string): Promise<void> {
  await tx.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
}

export async function getLimits(db: Db, branchId: string): Promise<BranchLimits | null> {
  const res = await db.query<BranchLimits>(
    `SELECT max_qty_per_sku_default AS max_qty_per_sku, max_order_weight_kg::float8 AS max_order_weight_kg,
            heavy_order_threshold_kg::float8 AS heavy_order_threshold_kg
     FROM branch_limits WHERE branch_id = $1`,
    [branchId],
  );
  return res.rows[0] ?? null;
}

export async function getPricingConfig(db: Db, branchId: string): Promise<PricingConfig | null> {
  const res = await db.query<PricingConfig>(
    `SELECT base_fee, per_km, free_km::float8 AS free_km, weight_threshold_kg::float8 AS weight_threshold_kg,
            surcharge_per_kg, fee_min, fee_max, min_order, circuity_factor::float8 AS circuity_factor
     FROM branch_pricing_config WHERE branch_id = $1`,
    [branchId],
  );
  return res.rows[0] ?? null;
}
