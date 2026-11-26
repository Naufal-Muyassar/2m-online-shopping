import type { PlatformWalletManualRequest, PlatformWalletQuery, PlatformWalletResponse } from "@2m/shared";
import { audit } from "../../shared/audit";
import { pool, withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import * as repo from "./repo";

// Dompet 2M (see db/migrations/1761000000016_tiered_fee_platform_wallet.sql).
// Order entries are written by settleOrder inside the order transition; this module only reads them and records
// the manual entries (running costs and top-ups) that super_admin enters.

export async function overview(q: PlatformWalletQuery): Promise<PlatformWalletResponse> {
  if (q.from && q.to && q.from > q.to) {
    throw new AppError(400, "VALIDATION_ERROR", "from must not be after to", { missing: ["from"] });
  }
  const filter: repo.WalletFilter = { branchId: q.branch_id ?? null, from: q.from ?? null, to: q.to ?? null };
  const [head, page] = await Promise.all([
    repo.summary(pool, filter),
    repo.listEntries(pool, filter, { cursor: q.cursor, limit: q.limit }),
  ]);
  return { ...head, ...page };
}

export interface ManualResult {
  id: string;
  amount: number;
  created_at: string;
}

export async function recordManual(adminId: string, body: PlatformWalletManualRequest): Promise<ManualResult> {
  const signed = body.type === "EXPENSE" ? -body.amount : body.amount;
  return withTransaction(async (tx) => {
    const replay = await repo.findManual(tx, body.idempotency_key);
    if (replay) {
      const same =
        replay.type === body.type &&
        replay.amount === signed &&
        replay.category === body.category &&
        replay.branch_id === body.branch_id;
      if (!same) {
        throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This wallet entry was already recorded with different values", {
          amount: Math.abs(replay.amount),
        });
      }
      return { id: replay.id, amount: replay.amount, created_at: replay.created_at.toISOString() };
    }
    if (body.branch_id && !(await repo.branchExists(tx, body.branch_id))) {
      throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    }
    const row = await repo.insertManual(tx, {
      type: body.type,
      category: body.category,
      amount: signed,
      branchId: body.branch_id,
      note: body.note,
      recordedBy: adminId,
      idempotencyKey: body.idempotency_key,
    });
    await audit(tx, {
      actorId: adminId,
      actorRole: "super_admin",
      branchId: body.branch_id,
      action: body.type === "EXPENSE" ? "PLATFORM_WALLET_EXPENSE" : "PLATFORM_WALLET_TOP_UP",
      entityType: "platform_wallet_entry",
      entityId: row.id,
      after: { type: body.type, category: body.category, amount: signed, note: body.note },
    });
    return { id: row.id, amount: row.amount, created_at: row.created_at.toISOString() };
  });
}
