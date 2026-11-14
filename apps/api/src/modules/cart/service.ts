import type { Cart } from "@2m/shared";
import type { Pool } from "pg";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { branchIsActive } from "../catalog/repo";
import { computeSellable } from "../inventory/repo";
import * as repo from "./repo";

type Db = Pool | Tx;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function totalsOf(lines: readonly repo.CartLine[]): { subtotal: number; weightKg: number } {
  return {
    subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
    weightKg: round3(lines.reduce((s, l) => s + l.weight_kg * l.qty, 0)),
  };
}

export function validateLines(limits: repo.BranchLimits, lines: readonly repo.CartLine[]): void {
  for (const l of lines) {
    if (l.qty > limits.max_qty_per_sku) {
      throw new AppError(409, "MAX_QTY_EXCEEDED", `Maximum ${limits.max_qty_per_sku} per product`, {
        product: l.name,
        max: limits.max_qty_per_sku,
      });
    }
  }
  const { weightKg } = totalsOf(lines);
  if (weightKg > limits.max_order_weight_kg) {
    throw new AppError(409, "MAX_WEIGHT_EXCEEDED", `Maximum order weight is ${limits.max_order_weight_kg} kg`, {
      max: limits.max_order_weight_kg,
      weight_kg: weightKg,
    });
  }
}

export async function requireBranchConfig(db: Db, branchId: string) {
  if (!(await branchIsActive(db, branchId))) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
  const [limits, pricing] = await Promise.all([repo.getLimits(db, branchId), repo.getPricingConfig(db, branchId)]);
  if (!limits || !pricing) throw new AppError(409, "BRANCH_NOT_CONFIGURED", "Branch is not configured for orders");
  return { limits, pricing };
}

async function sellableOf(db: Db, branchId: string, productIds: readonly string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await computeSellable(db, { branchId, productIds });
  return new Map(rows.map((r) => [r.product_id, Math.max(0, r.sellable)] as const));
}

// Raising a line past what the branch can sell is refused; lowering it is always allowed,
// so a cart left above a stock that has since dropped can still be brought down.
async function assertStock(db: Db, branchId: string, productId: string, name: string, qty: number, current: number) {
  if (qty <= current) return;
  const available = (await sellableOf(db, branchId, [productId])).get(productId) ?? 0;
  if (available <= 0) throw new AppError(409, "OUT_OF_STOCK", "Product is out of stock", { product: name });
  if (qty > available) {
    throw new AppError(409, "OUT_OF_STOCK", "Not enough stock", { product: name, items: [{ name, available }] });
  }
}

export function toCart(
  branchId: string,
  lines: readonly repo.CartLine[],
  limits: repo.BranchLimits,
  minOrder: number,
  sellable: ReadonlyMap<string, number> = new Map(),
): Cart {
  const { subtotal, weightKg } = totalsOf(lines);
  return {
    branch_id: branchId,
    items: lines.map((l) => ({ ...l, line_total: l.price * l.qty, sellable_qty: sellable.get(l.product_id) ?? 0 })),
    subtotal,
    total_weight_kg: weightKg,
    is_bulk_order: weightKg >= limits.heavy_order_threshold_kg,
    limits: {
      max_qty_per_sku: limits.max_qty_per_sku,
      max_order_weight_kg: limits.max_order_weight_kg,
      min_order: minOrder,
    },
  };
}

async function buildCart(db: Db, userId: string, branchId: string): Promise<Cart> {
  const { limits, pricing } = await requireBranchConfig(db, branchId);
  const cartId = await repo.findCartId(db, userId, branchId);
  const lines = cartId ? await repo.getLines(db, cartId, branchId) : [];
  const sellable = await sellableOf(db, branchId, lines.map((l) => l.product_id));
  return toCart(branchId, lines, limits, pricing.min_order, sellable);
}

export const getCart = (userId: string, branchId: string): Promise<Cart> => buildCart(pool, userId, branchId);

export async function addItem(userId: string, branchId: string, productId: string, qty: number): Promise<Cart> {
  return withTransaction(async (tx) => {
    const { limits } = await requireBranchConfig(tx, branchId);
    const product = await repo.getSellableProduct(tx, branchId, productId);
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not available in this branch");
    const cartId = await repo.lockOrCreateCart(tx, userId, branchId);
    const lines = await repo.getLines(tx, cartId, branchId);
    const existing = lines.find((l) => l.product_id === productId);
    await assertStock(tx, branchId, productId, product.name, (existing?.qty ?? 0) + qty, existing?.qty ?? 0);
    const next = lines.filter((l) => l.product_id !== productId);
    next.push({
      product_id: productId, sku: "", name: product.name, unit: "", price: 0,
      weight_kg: product.weight_kg, qty: (existing?.qty ?? 0) + qty,
    });
    validateLines(limits, next);
    await repo.setQty(tx, cartId, branchId, productId, (existing?.qty ?? 0) + qty);
    return buildCart(tx, userId, branchId);
  });
}

export async function setQty(userId: string, branchId: string, productId: string, qty: number): Promise<Cart> {
  return withTransaction(async (tx) => {
    const { limits } = await requireBranchConfig(tx, branchId);
    const cartId = await repo.lockOrCreateCart(tx, userId, branchId);
    const lines = await repo.getLines(tx, cartId, branchId);
    const line = lines.find((l) => l.product_id === productId);
    if (!line) throw new AppError(404, "ITEM_NOT_IN_CART", "Item is not in the cart");
    validateLines(limits, lines.map((l) => (l.product_id === productId ? { ...l, qty } : l)));
    await assertStock(tx, branchId, productId, line.name, qty, line.qty);
    await repo.setQty(tx, cartId, branchId, productId, qty);
    return buildCart(tx, userId, branchId);
  });
}

export async function removeItem(userId: string, branchId: string, productId: string): Promise<Cart> {
  return withTransaction(async (tx) => {
    await requireBranchConfig(tx, branchId);
    const cartId = await repo.lockOrCreateCart(tx, userId, branchId);
    await repo.removeItem(tx, cartId, productId);
    return buildCart(tx, userId, branchId);
  });
}
