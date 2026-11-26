import type {
  AdminRefund,
  CustomerRefund,
  OrderStatus,
  RefundDestinationRequest,
  RefundProofUploadResponse,
  RefundReason,
} from "@2m/shared";
import { audit } from "../../shared/audit";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { isRefundProofKeyFor, objectExists, presignGet, presignPut, refundProofKeyFor } from "../../shared/storage";
import * as repo from "./repo";

// Refunds (see docs/architecture/stock-and-checkout.md, "Refund").
// Invariants:
//  1. Σ refunds of an order ≤ its grand total. Every insert reads the sum under the order row lock.
//  2. One refund per cause: system refunds are opened in the transaction of their cause with a fixed dedupe key,
//     admin refunds carry the client's idempotency key. A replay finds the existing row.
//  3. COMPLETED only from READY, in one conditional statement, with a transfer reference and an uploaded receipt.

export const FAILED_DELIVERY_REFUND_KEY = "auto:failed_delivery";

// Statuses an order can be cancelled from after the money arrived.
const PAID_STATUSES: readonly OrderStatus[] = ["PAID", "ACCEPTED", "PICKING", "READY", "ASSIGNED"];

interface LockedOrder {
  id: string;
  branch_id: string;
  customer_id: string;
  grand_total: number;
  delivery_fee: number;
  voucher_discount: number;
}

async function open(
  tx: Tx,
  order: LockedOrder,
  r: { reason: RefundReason; amount: number; dedupeKey: string; note?: string | null; createdBy?: string | null },
): Promise<repo.RefundRow | null> {
  const existing = await repo.findByDedupeKey(tx, order.id, r.dedupeKey);
  if (existing) return existing;
  const remaining = order.grand_total - (await repo.refundedTotal(tx, order.id));
  const amount = Math.min(r.amount, remaining);
  if (amount <= 0) {
    logger.warn({ order_id: order.id, reason: r.reason, wanted: r.amount }, "refund skipped, order already fully refunded");
    return null;
  }
  const row = await repo.insertRefund(tx, {
    orderId: order.id,
    branchId: order.branch_id,
    customerId: order.customer_id,
    reason: r.reason,
    note: r.note ?? null,
    amount,
    dedupeKey: r.dedupeKey,
    createdBy: r.createdBy ?? null,
  });
  if (row) {
    await audit(tx, {
      actorId: r.createdBy ?? null,
      actorRole: r.createdBy ? "admin" : "system",
      branchId: order.branch_id,
      action: "REFUND_OPENED",
      entityType: "refund",
      entityId: row.id,
      after: { order_id: order.id, reason: r.reason, amount },
    });
  }
  return row;
}

async function lockedOrder(tx: Tx, orderId: string): Promise<LockedOrder> {
  const res = await tx.query<LockedOrder>(
    `SELECT id, branch_id, customer_id, grand_total, delivery_fee, voucher_discount FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );
  const o = res.rows[0];
  if (!o) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  return o;
}

// Called by transition() in the same transaction as the status change (the order row is already locked there).
export async function onTransition(tx: Tx, t: { orderId: string; from: OrderStatus; to: OrderStatus }): Promise<void> {
  if (t.to === "CANCELLED" && PAID_STATUSES.includes(t.from)) {
    const order = await lockedOrder(tx, t.orderId);
    await open(tx, order, { reason: "ORDER_CANCELLED", amount: order.grand_total, dedupeKey: "auto:cancelled" });
    return;
  }
  // Owner's rule: a failed delivery costs the customer no ongkir. The courier's failed pay comes out of the 2M wallet.
  // Vouchers are ongkir vouchers, so the ongkir the customer actually paid is delivery_fee − voucher_discount.
  if (t.to === "FAILED") {
    const order = await lockedOrder(tx, t.orderId);
    const paidOngkir = order.delivery_fee - order.voucher_discount;
    if (paidOngkir > 0) {
      await open(tx, order, { reason: "DELIVERY_FAILED", amount: paidOngkir, dedupeKey: FAILED_DELIVERY_REFUND_KEY });
    }
    return;
  }
  if (t.from === "PICKING" && t.to === "ON_DELIVERY") {
    const res = await tx.query<{ short: number }>(
      `SELECT COALESCE(sum((qty - COALESCE(picked_qty, 0)) * unit_price), 0)::int AS short
       FROM order_items WHERE order_id = $1 AND COALESCE(picked_qty, 0) < qty`,
      [t.orderId],
    );
    const short = res.rows[0]!.short;
    if (short > 0) {
      const order = await lockedOrder(tx, t.orderId);
      await open(tx, order, { reason: "ITEM_SHORTAGE", amount: short, dedupeKey: "auto:shortage" });
    }
  }
}

// A payment that settled on an order already cancelled (the gateway accepted it after we gave up). Called from
// payment settlement under the order row lock; keyed by invoice, so webhook redelivery and reconciliation agree.
export async function onLatePayment(tx: Tx, orderId: string, invoice: { id: string; paidAmount: number | null; amount: number }) {
  const order = await lockedOrder(tx, orderId);
  await open(tx, order, {
    reason: "LATE_PAYMENT",
    amount: invoice.paidAmount ?? invoice.amount,
    dedupeKey: `auto:late:${invoice.id}`,
  });
}

export async function createManual(input: {
  branchId: string;
  admin: { id: string; role: string };
  orderCode: string;
  amount: number;
  note: string;
  idempotencyKey: string;
}): Promise<AdminRefund> {
  const row = await withTransaction(async (tx) => {
    const res = await tx.query<LockedOrder>(
      `SELECT id, branch_id, customer_id, grand_total FROM orders WHERE code = $1 AND branch_id = $2 FOR UPDATE`,
      [input.orderCode, input.branchId],
    );
    const order = res.rows[0];
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found in this branch");

    const dedupeKey = `manual:${input.idempotencyKey}`;
    const replay = await repo.findByDedupeKey(tx, order.id, dedupeKey);
    if (replay) {
      if (replay.amount !== input.amount || replay.note !== input.note) {
        throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was used for a different refund");
      }
      return replay;
    }
    const paid = await tx.query(
      `SELECT 1 FROM order_state_transitions WHERE order_id = $1 AND to_status = 'PAID'
       UNION ALL SELECT 1 FROM refunds WHERE order_id = $1 AND reason = 'LATE_PAYMENT' LIMIT 1`,
      [order.id],
    );
    if (paid.rowCount === 0) throw new AppError(409, "ORDER_NOT_PAID", "This order was never paid");
    const remaining = order.grand_total - (await repo.refundedTotal(tx, order.id));
    if (input.amount > remaining) {
      throw new AppError(409, "REFUND_EXCEEDS_ORDER", "Refunds would exceed the order total", { remaining });
    }
    const created = await open(tx, order, {
      reason: "OTHER",
      amount: input.amount,
      dedupeKey,
      note: input.note,
      createdBy: input.admin.id,
    });
    if (!created) throw new AppError(409, "REFUND_EXCEEDS_ORDER", "Refunds would exceed the order total", { remaining });
    return created;
  });
  return (await adminView([row]))[0]!;
}

export async function setDestination(
  customerId: string,
  orderId: string,
  refundId: string,
  d: RefundDestinationRequest,
): Promise<CustomerRefund> {
  const row = await repo.setDestination(pool, {
    refundId,
    orderId,
    customerId,
    method: d.method,
    provider: d.provider,
    accountNo: d.account_no,
    accountName: d.account_name,
  });
  if (row) return customerView(row);
  const existing = await repo.findById(pool, refundId);
  if (!existing || existing.order_id !== orderId || existing.customer_id !== customerId) {
    throw new AppError(404, "REFUND_NOT_FOUND", "Refund not found");
  }
  throw new AppError(409, "REFUND_ALREADY_COMPLETED", "This refund was already paid out");
}

async function branchRefund(refundId: string, branchId: string): Promise<repo.RefundRow> {
  const row = await repo.findById(pool, refundId);
  if (!row || row.branch_id !== branchId) throw new AppError(404, "REFUND_NOT_FOUND", "Refund not found");
  return row;
}

export async function proofUploadUrl(refundId: string, branchId: string): Promise<RefundProofUploadResponse> {
  const row = await branchRefund(refundId, branchId);
  if (row.status === "COMPLETED") throw new AppError(409, "REFUND_ALREADY_COMPLETED", "This refund was already paid out");
  const key = refundProofKeyFor(refundId);
  return { upload_url: await presignPut(key), proof_key: key };
}

// Idempotent: repeating the same completion (same receipt) answers with the completed refund.
export async function completeRefund(input: {
  refundId: string;
  branchId: string;
  admin: { id: string; role: string };
  transferRef: string;
  proofKey: string;
}): Promise<AdminRefund> {
  if (!isRefundProofKeyFor(input.refundId, input.proofKey)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid proof_key", { missing: ["proof_key"] });
  }
  if (!(await objectExists(input.proofKey))) {
    throw new AppError(400, "PROOF_NOT_UPLOADED", "Upload the transfer receipt first");
  }
  const row = await withTransaction(async (tx) => {
    const done = await repo.complete(tx, {
      refundId: input.refundId,
      branchId: input.branchId,
      adminId: input.admin.id,
      transferRef: input.transferRef,
      proofKey: input.proofKey,
    });
    if (done) {
      await audit(tx, {
        actorId: input.admin.id,
        actorRole: input.admin.role,
        branchId: input.branchId,
        action: "REFUND_COMPLETED",
        entityType: "refund",
        entityId: done.id,
        before: { status: "READY" },
        after: { status: "COMPLETED", amount: done.amount, transfer_ref: done.transfer_ref },
      });
    }
    return done;
  });
  if (row) return (await adminView([row]))[0]!;

  const current = await branchRefund(input.refundId, input.branchId);
  if (current.status === "COMPLETED" && current.proof_key === input.proofKey) return (await adminView([current]))[0]!;
  if (current.status === "COMPLETED") throw new AppError(409, "REFUND_ALREADY_COMPLETED", "This refund was already paid out");
  throw new AppError(409, "REFUND_NEEDS_DESTINATION", "The customer has not given a destination account yet");
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Last four digits only: enough for the customer to recognise the account, useless to anyone else.
const mask = (accountNo: string) => `•••• ${accountNo.slice(-4)}`;

export async function customerView(r: repo.RefundRow): Promise<CustomerRefund> {
  return {
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    note: r.note,
    status: r.status,
    created_at: r.created_at.toISOString(),
    completed_at: iso(r.completed_at),
    destination:
      r.dest_method && r.dest_account_no
        ? {
            method: r.dest_method,
            provider: r.dest_provider ?? "",
            account_masked: mask(r.dest_account_no),
            account_name: r.dest_account_name ?? "",
          }
        : null,
    transfer_ref: r.transfer_ref,
    proof_url: r.status === "COMPLETED" && r.proof_key ? await presignGet(r.proof_key) : null,
  };
}

export async function customerRefunds(orderId: string): Promise<CustomerRefund[]> {
  return Promise.all((await repo.listForOrder(pool, orderId)).map(customerView));
}

async function adminView(rows: (repo.RefundRow & Partial<repo.AdminRefundRow>)[]): Promise<AdminRefund[]> {
  const missing = rows.filter((r) => r.order_code === undefined).map((r) => r.id);
  const extra = new Map<string, repo.AdminRefundRow>();
  if (missing.length > 0) {
    const res = await pool.query<repo.AdminRefundRow>(
      `SELECT r.id, o.code AS order_code, o.status AS order_status, cu.name AS customer_name, ad.name AS completed_by_name
       FROM refunds r JOIN orders o ON o.id = r.order_id JOIN users cu ON cu.id = r.customer_id
       LEFT JOIN users ad ON ad.id = r.completed_by WHERE r.id = ANY($1::uuid[])`,
      [missing],
    );
    for (const e of res.rows) extra.set(e.id, e);
  }
  return Promise.all(
    rows.map(async (r) => {
      const e = { ...r, ...extra.get(r.id) } as repo.AdminRefundRow;
      return {
        id: e.id,
        order_id: e.order_id,
        order_code: e.order_code,
        order_status: e.order_status,
        customer_name: e.customer_name,
        amount: e.amount,
        reason: e.reason,
        note: e.note,
        status: e.status,
        created_at: e.created_at.toISOString(),
        completed_at: iso(e.completed_at),
        completed_by_name: e.completed_by_name ?? null,
        destination:
          e.dest_method && e.dest_account_no
            ? {
                method: e.dest_method,
                provider: e.dest_provider ?? "",
                account_no: e.dest_account_no,
                account_name: e.dest_account_name ?? "",
              }
            : null,
        transfer_ref: e.transfer_ref,
        proof_url: e.proof_key ? await presignGet(e.proof_key) : null,
      };
    }),
  );
}

export async function listBranch(branchId: string, state: "open" | "completed"): Promise<AdminRefund[]> {
  return adminView(await repo.listForBranch(pool, branchId, state === "completed"));
}
