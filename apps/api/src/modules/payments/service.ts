import type { IncomingHttpHeaders } from "node:http";
import { paymentMethodSchema, xenditInvoiceCallbackSchema } from "@2m/shared";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { env } from "../../config/env";
import * as ordersRepo from "../orders/repo";
import { linkInvoice, releaseOrder } from "../inventory/service";
import { transition, type TransitionActor } from "../orders/service";
import { PaymentProviderError, type Invoice } from "./provider";
import { MockAdapter } from "./mock.adapter";
import { getPaymentProvider } from "./registry";
import * as repo from "./repo";

export const INVOICE_DURATION_SEC = 900;
export const FIRST_ATTEMPT = 1;
const CREATE_TRIES = 2;
const STALE_AFTER_MIN = 20;
const RECONCILE_BATCH = 100;
const ORDER_CODE_IN_EXTERNAL_ID = /^(ORD-\d{6}-[A-Z0-9]{4})-\d+$/;
const SYSTEM: TransitionActor = { id: null, role: "system" };

export const externalIdFor = (orderCode: string, attempt = FIRST_ATTEMPT): string => `${orderCode}-${attempt}`;

export type SettleOutcome =
  | "PAID"
  | "EXPIRED_CANCELLED"
  | "PENDING"
  | "NOOP_STATE"
  | "AMOUNT_MISMATCH"
  | "UNKNOWN_ORDER"
  | "NOT_READY";

async function obtainInvoice(order: repo.PaymentOrderInfo, attempt: number): Promise<Invoice> {
  const provider = getPaymentProvider();
  const externalId = externalIdFor(order.code, attempt);
  const paymentMethod = paymentMethodSchema.parse(order.payment_method);
  const returnUrl = `${env.CUSTOMER_WEB_URL}/orders/${order.id}/return`;

  let lastErr: unknown;
  for (let i = 0; i < CREATE_TRIES; i++) {
    try {
      // After a failed try the invoice may exist on the provider side, so look it up before creating another.
      if (i > 0) {
        const existing = await provider.findInvoiceByExternalId(externalId);
        if (existing) return existing;
      }
      return await provider.createInvoice({
        externalId,
        amount: order.grand_total,
        durationSec: INVOICE_DURATION_SEC,
        description: `Pesanan ${order.code}`,
        paymentMethod,
        successRedirectUrl: returnUrl,
        failureRedirectUrl: returnUrl,
      });
    } catch (err) {
      lastErr = err;
      if (err instanceof PaymentProviderError && !err.retryable) break;
    }
  }
  throw lastErr;
}

async function attachInvoice(tx: Tx, orderId: string, invoice: Invoice) {
  const result = await transition(tx, {
    orderId,
    to: "PENDING_PAYMENT",
    actor: SYSTEM,
    meta: { invoice: { id: invoice.id, url: invoice.invoiceUrl, expires_at: invoice.expiresAt } },
  });
  await linkInvoice(tx, orderId, invoice.id);
  return result;
}

async function cancelUnpayable(orderId: string, opts: { restoreCart: boolean }): Promise<void> {
  await withTransaction(async (tx) => {
    const order = await ordersRepo.lockOrder(tx, orderId);
    if (!order || order.status !== "CREATED") return;
    await transition(tx, { orderId, to: "CANCELLED", actor: SYSTEM, meta: { reason: "PAYMENT_INIT_FAILED" } });
    if (opts.restoreCart) await repo.restoreCart(tx, orderId);
  });
  // The outbox would release it too; doing it now lets the customer retry straight away with the restored cart.
  await releaseOrder(orderId).catch((err) => logger.error({ err, order_id: orderId }, "could not release stock after payment init failure"));
}

// Runs after Tx1 committed (order CREATED). The provider call happens outside any DB transaction.
export async function initiatePayment(orderId: string): Promise<{ order: ordersRepo.OrderRow; invoice: Invoice }> {
  const info = await repo.getOrderForPayment(pool, orderId);
  if (!info) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");

  let invoice: Invoice;
  try {
    invoice = await obtainInvoice(info, FIRST_ATTEMPT);
  } catch (err) {
    logger.error({ err, order_id: orderId }, "payment invoice creation failed");
    await cancelUnpayable(orderId, { restoreCart: true }).catch((e) =>
      logger.error({ err: e, order_id: orderId }, "could not cancel order after payment init failure"),
    );
    throw new AppError(502, "PAYMENT_INIT_FAILED", "Could not start the payment, please try again");
  }
  const { order } = await withTransaction((tx) => attachInvoice(tx, orderId, invoice));
  return { order, invoice };
}

// The only place that moves an order out of PENDING_PAYMENT because of the gateway. Safe to call any number
// of times, from webhooks and reconciliation alike: the order row lock plus the status check make it idempotent.
export async function settleFromInvoice(invoice: Invoice): Promise<SettleOutcome> {
  const code = ORDER_CODE_IN_EXTERNAL_ID.exec(invoice.externalId)?.[1];
  if (!code) return "UNKNOWN_ORDER";

  return withTransaction(async (tx): Promise<SettleOutcome> => {
    const order = await repo.lockOrderByCode(tx, code);
    if (!order) return "UNKNOWN_ORDER";
    if (order.status === "CREATED") return "NOT_READY";
    if (order.invoice_id !== invoice.id) return "UNKNOWN_ORDER";
    if (order.status !== "PENDING_PAYMENT") {
      if ((invoice.status === "PAID" || invoice.status === "SETTLED") && order.status === "CANCELLED") {
        logger.error({ order_id: order.id, invoice_id: invoice.id }, "payment received for a cancelled order, needs manual refund");
      }
      return "NOOP_STATE";
    }
    if (invoice.status === "PENDING") return "PENDING";

    const payload = { order_id: order.id, order_code: order.code, invoice_id: invoice.id, amount: order.grand_total };
    if (invoice.status === "EXPIRED") {
      await transition(tx, { orderId: order.id, to: "CANCELLED", actor: SYSTEM, meta: { reason: "PAYMENT_EXPIRED" } });
      await ordersRepo.insertOutboxEvent(tx, {
        aggregateId: order.id,
        branchId: order.branch_id,
        eventType: "PAYMENT_EXPIRED",
        payload,
      });
      return "EXPIRED_CANCELLED";
    }

    if (invoice.amount !== order.grand_total || invoice.paidAmount !== order.grand_total) {
      logger.error(
        { order_id: order.id, invoice_id: invoice.id, expected: order.grand_total, amount: invoice.amount, paid: invoice.paidAmount },
        "invoice amount does not match the order total",
      );
      return "AMOUNT_MISMATCH";
    }
    await transition(tx, {
      orderId: order.id,
      to: "PAID",
      actor: SYSTEM,
      meta: {
        reason: "PAYMENT_SUCCESS",
        payment_fee_actual: invoice.feesPaidAmount ?? undefined,
        demo_payment: getPaymentProvider() instanceof MockAdapter,
      },
    });
    await ordersRepo.insertOutboxEvent(tx, {
      aggregateId: order.id,
      branchId: order.branch_id,
      eventType: "PAYMENT_SUCCESS",
      payload,
    });
    return "PAID";
  });
}

const SENSITIVE_HEADERS = new Set(["x-callback-token", "authorization", "cookie"]);

function storableHeaders(headers: IncomingHttpHeaders): Record<string, unknown> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !SENSITIVE_HEADERS.has(k.toLowerCase())));
}

// Returns the HTTP status to answer with. Order matters: authenticate, persist, re-fetch, then one transaction.
export async function handleXenditWebhook(rawBody: string, headers: IncomingHttpHeaders): Promise<number> {
  const provider = getPaymentProvider();
  const token = headers["x-callback-token"];
  if (!provider.verifyCallbackToken(typeof token === "string" ? token : undefined)) return 401;

  let parsed;
  try {
    parsed = xenditInvoiceCallbackSchema.safeParse(JSON.parse(rawBody));
  } catch {
    return 400;
  }
  if (!parsed.success) return 400;
  const body = parsed.data;

  const event = await repo.recordEvent(pool, {
    invoiceId: body.id,
    externalId: body.external_id ?? null,
    status: body.status,
    rawBody,
    headers: storableHeaders(headers),
  });
  if (event.processed) return 200;

  // The callback body is untrusted for state and amounts; the provider's own record decides.
  const invoice = await provider.getInvoice(body.id);
  const outcome = await settleFromInvoice(invoice);
  if (outcome === "NOT_READY") return 503;
  if (outcome === "UNKNOWN_ORDER" || outcome === "AMOUNT_MISMATCH") {
    logger.warn({ invoice_id: invoice.id, outcome }, "xendit callback rejected");
  }
  // Left unprocessed when the provider still says PENDING, so a later redelivery of the same callback is re-checked.
  if (outcome !== "PENDING") await repo.markEventProcessed(pool, event.id, outcome);
  return 200;
}

// Safety net for lost webhooks and for orders orphaned between Tx1 and Tx2 of order creation.
export async function reconcilePayments(): Promise<{ checked: number; changed: number }> {
  const provider = getPaymentProvider();
  let checked = 0;
  let changed = 0;

  for (const order of await repo.listStalePending(pool, STALE_AFTER_MIN, RECONCILE_BATCH)) {
    checked++;
    try {
      const outcome = await settleFromInvoice(await provider.getInvoice(order.invoice_id));
      if (outcome === "PAID" || outcome === "EXPIRED_CANCELLED") changed++;
    } catch (err) {
      logger.error({ err, order_id: order.id }, "payment reconciliation failed for order");
    }
  }

  for (const order of await repo.listStuckCreated(pool, STALE_AFTER_MIN, RECONCILE_BATCH)) {
    checked++;
    try {
      const invoice = await provider.findInvoiceByExternalId(externalIdFor(order.code));
      if (!invoice) {
        await cancelUnpayable(order.id, { restoreCart: false });
        changed++;
        continue;
      }
      await withTransaction((tx) => attachInvoice(tx, order.id, invoice));
      const outcome = await settleFromInvoice(invoice);
      if (outcome === "PAID" || outcome === "EXPIRED_CANCELLED") changed++;
    } catch (err) {
      logger.error({ err, order_id: order.id }, "reconciliation failed for order without invoice");
    }
  }
  return { checked, changed };
}

export function startReconcileLoop(intervalMs: number): { stop: () => void } {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { checked, changed } = await reconcilePayments();
      if (checked > 0) logger.info({ checked, changed }, "payment reconciliation finished");
    } catch (err) {
      logger.error({ err }, "payment reconciliation crashed");
    } finally {
      running = false;
    }
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}
