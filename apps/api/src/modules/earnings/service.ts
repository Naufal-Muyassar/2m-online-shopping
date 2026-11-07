import type { CourierBalance, CourierLedgerResponse, CourierWithdrawalResponse } from "@2m/shared";
import { pool, withTransaction } from "../../shared/db";
import { audit } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { getCourier } from "../courier/repo";
import * as repo from "./repo";

export async function courierBalance(courierId: string): Promise<CourierBalance> {
  return { balance: await repo.getBalance(pool, courierId) };
}

export async function courierHistory(courierId: string, opts: { cursor?: string; limit: number }): Promise<CourierLedgerResponse> {
  return repo.listEntries(pool, courierId, opts);
}

export async function branchCourierHistory(
  courierId: string,
  branchId: string,
  opts: { cursor?: string; limit: number },
): Promise<CourierLedgerResponse> {
  const courier = await getCourier(pool, courierId);
  // Out-of-branch couriers look nonexistent.
  if (courier?.branch_id !== branchId) throw new AppError(404, "COURIER_NOT_FOUND", "Courier not found");
  return repo.listEntries(pool, courierId, opts);
}

export async function recordWithdrawal(input: {
  courierId: string;
  branchId: string;
  adminId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<CourierWithdrawalResponse> {
  return withTransaction(async (tx) => {
    // The courier row lock serialises withdrawals, so the balance read below cannot go stale before the insert.
    const courier = await getCourier(tx, input.courierId, true);
    if (courier?.branch_id !== input.branchId) throw new AppError(404, "COURIER_NOT_FOUND", "Courier not found");

    const balance = await repo.getBalance(tx, input.courierId);
    const replay = await repo.findWithdrawal(tx, input.courierId, input.idempotencyKey);
    if (replay) {
      if (-replay.amount !== input.amount) {
        throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This withdrawal was already recorded with a different amount", {
          amount: -replay.amount,
        });
      }
      return { id: replay.id, amount: input.amount, balance, created_at: replay.created_at.toISOString() };
    }
    if (input.amount > balance) {
      throw new AppError(409, "INSUFFICIENT_BALANCE", "Amount exceeds the courier's balance", { balance });
    }

    const entry = await repo.insertWithdrawal(tx, input);
    await audit(tx, {
      actorId: input.adminId,
      actorRole: "branch_admin",
      branchId: input.branchId,
      action: "COURIER_WITHDRAWAL",
      entityType: "courier",
      entityId: input.courierId,
      before: { balance },
      after: { balance: balance - input.amount, amount: input.amount, ledger_entry_id: entry.id },
    });
    return { id: entry.id, amount: input.amount, balance: balance - input.amount, created_at: entry.created_at.toISOString() };
  });
}
