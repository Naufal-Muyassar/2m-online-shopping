import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { getRedis } from "../../shared/redis";
import type { Tx } from "../../shared/db";
import { withTransaction } from "../../shared/db";
import * as repo from "./repo";

// Counters hold the sellable quantity per branch+product. Postgres stays the source of truth; every counter
// can be rebuilt from it (seedMissing lazily, rebuildAll on boot).
export const counterKey = (branchId: string, productId: string): string => `stock:${branchId}:${productId}`;
export const COUNTER_PATTERN = "stock:*";

// Shared by checkouts for the duration of Tx1, exclusive for a full rebuild: a rebuild never reads Postgres
// while a reservation is decremented in Redis but not yet committed.
const REBUILD_LOCK_ID = 7_610_005;

// All-or-nothing: returns {0} after decrementing every key, {1, "i:available"...} when some are short,
// {2, i...} when counters are missing (nothing is touched in both failure cases).
const RESERVE_LUA = `
local missing, short = {}, {}
for i = 1, #KEYS do
  local v = redis.call('GET', KEYS[i])
  if not v then
    missing[#missing + 1] = tostring(i)
  elseif tonumber(v) < tonumber(ARGV[i]) then
    short[#short + 1] = i .. ':' .. v
  end
end
if #missing > 0 then return {2, unpack(missing)} end
if #short > 0 then return {1, unpack(short)} end
for i = 1, #KEYS do redis.call('DECRBY', KEYS[i], ARGV[i]) end
return {0}
`;

// Missing counters are skipped: they will be rebuilt from Postgres, which already reflects the release.
const RESTORE_LUA = `
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then redis.call('INCRBY', KEYS[i], ARGV[i]) end
end
return 0
`;

export interface Shortage {
  productId: string;
  requested: number;
  available: number;
}

export class InsufficientStockError extends Error {
  constructor(readonly shortages: Shortage[]) {
    super("insufficient stock");
  }
}

function merge(items: readonly repo.StockItem[]): repo.StockItem[] {
  const byKey = new Map<string, repo.StockItem>();
  for (const i of items) {
    const k = counterKey(i.branchId, i.productId);
    const cur = byKey.get(k);
    byKey.set(k, cur ? { ...cur, qty: cur.qty + i.qty } : { ...i });
  }
  return [...byKey.values()];
}

async function seedMissing(tx: Tx, items: readonly repo.StockItem[]): Promise<void> {
  const redis = getRedis();
  const byBranch = new Map<string, string[]>();
  for (const i of items) byBranch.set(i.branchId, [...(byBranch.get(i.branchId) ?? []), i.productId]);
  for (const [branchId, productIds] of byBranch) {
    const rows = await repo.computeSellable(tx, { branchId, productIds });
    const pipe = redis.pipeline();
    // NX: a counter another checkout seeded in the meantime may already be decremented.
    for (const r of rows) pipe.set(counterKey(r.branch_id, r.product_id), r.sellable, "NX");
    await pipe.exec();
  }
}

// Throws InsufficientStockError (nothing reserved) or AppError 503 when Redis is unreachable.
// Must run inside the checkout transaction so the rebuild lock is held until Postgres has the rows.
export async function reserve(tx: Tx, items: readonly repo.StockItem[]): Promise<repo.StockItem[]> {
  const wanted = merge(items);
  await tx.query("SELECT pg_advisory_xact_lock_shared($1)", [REBUILD_LOCK_ID]);
  const keys = wanted.map((i) => counterKey(i.branchId, i.productId));
  const args = wanted.map((i) => i.qty);

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [status, ...rest] = (await getRedis().eval(RESERVE_LUA, keys.length, ...keys, ...args)) as (number | string)[];
      if (status === 0) return wanted;
      if (status === 1) {
        throw new InsufficientStockError(
          rest.map((entry) => {
            const [idx, available] = String(entry).split(":");
            const item = wanted[Number(idx) - 1]!;
            return { productId: item.productId, requested: item.qty, available: Math.max(0, Number(available)) };
          }),
        );
      }
      await seedMissing(tx, rest.map((idx) => wanted[Number(idx) - 1]!));
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) throw err;
    logger.error({ err }, "stock counters unavailable");
    throw new AppError(503, "STOCK_UNAVAILABLE", "Stock check is temporarily unavailable, please try again");
  }
  throw new AppError(503, "STOCK_UNAVAILABLE", "Stock check is temporarily unavailable, please try again");
}

// Gives quantities back to existing counters. Failures are logged, never thrown: Postgres already holds the
// truth and a boot-time rebuild repairs a counter that stayed low.
export async function restore(items: readonly repo.StockItem[]): Promise<void> {
  if (items.length === 0) return;
  const wanted = merge(items);
  try {
    await getRedis().eval(
      RESTORE_LUA,
      wanted.length,
      ...wanted.map((i) => counterKey(i.branchId, i.productId)),
      ...wanted.map((i) => i.qty),
    );
  } catch (err) {
    logger.error({ err, items: wanted }, "could not give stock back to redis, a rebuild is needed");
  }
}

// Overwrites every counter with the Postgres-derived value.
export async function rebuildAll(): Promise<number> {
  return withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [REBUILD_LOCK_ID]);
    const rows = await repo.computeSellable(tx, null);
    const pipe = getRedis().pipeline();
    for (const r of rows) pipe.set(counterKey(r.branch_id, r.product_id), r.sellable);
    await pipe.exec();
    return rows.length;
  });
}

// Replaces one counter after a stock snapshot changed.
export async function refresh(branchId: string, productId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [REBUILD_LOCK_ID]);
    const rows = await repo.computeSellable(tx, { branchId, productIds: [productId] });
    for (const r of rows) await getRedis().set(counterKey(r.branch_id, r.product_id), r.sellable);
  });
}

export async function readCounter(branchId: string, productId: string): Promise<number | null> {
  const v = await getRedis().get(counterKey(branchId, productId));
  return v === null ? null : Number(v);
}
