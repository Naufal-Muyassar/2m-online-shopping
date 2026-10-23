import { AppError } from "../../shared/errors";
import { MockAdapter } from "./mock.adapter";
import { getPaymentProvider } from "./registry";
import { settleFromInvoice, type SettleOutcome } from "./service";

function mockProvider(): MockAdapter {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockAdapter)) throw new AppError(404, "NOT_FOUND", "Mock payments are not enabled");
  return provider;
}

export async function getMockInvoice(invoiceId: string) {
  const inv = await mockProvider().describe(invoiceId);
  if (!inv) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  return {
    invoice_id: inv.id,
    external_id: inv.externalId,
    order_id: inv.orderId,
    amount: inv.amount,
    method: inv.method,
    status: inv.status === "SETTLED" ? ("PAID" as const) : (inv.status as "PENDING" | "PAID" | "EXPIRED"),
    expires_at: inv.expiresAt.toISOString(),
    paid_at: inv.paidAt?.toISOString() ?? null,
  };
}

// Same settle path as the Xendit webhook and reconciliation; repeating it is a no-op once the order has left PENDING_PAYMENT.
export async function payMockInvoice(invoiceId: string): Promise<SettleOutcome> {
  const invoice = await mockProvider().pay(invoiceId);
  if (invoice.status === "EXPIRED") throw new AppError(409, "INVOICE_EXPIRED", "Invoice has expired");
  return settleFromInvoice(invoice);
}

export async function expireMockInvoice(invoiceId: string): Promise<SettleOutcome> {
  return settleFromInvoice(await mockProvider().expire(invoiceId));
}
