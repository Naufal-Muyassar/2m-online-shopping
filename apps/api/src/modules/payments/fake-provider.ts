import { randomUUID } from "node:crypto";
import {
  PaymentProviderError,
  type CreateInvoiceInput,
  type Invoice,
  type PaymentProvider,
  type RefundInput,
} from "./provider";

// In-memory provider for tests: invoices only change through pay() / expire().
export class FakeProvider implements PaymentProvider {
  readonly callbackToken = "test-callback-token";
  readonly invoices = new Map<string, Invoice>();
  createCalls = 0;
  getCalls = 0;
  failNextCreates = 0;
  // The invoice is created on the provider side but the response never reaches us (timeout).
  loseNextCreateResponse = false;

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    this.createCalls++;
    if (this.failNextCreates > 0) {
      this.failNextCreates--;
      throw new PaymentProviderError("fake create failure", true);
    }
    const id = `inv-${randomUUID()}`;
    const invoice: Invoice = {
      id,
      externalId: input.externalId,
      status: "PENDING",
      amount: input.amount,
      paidAmount: null,
      invoiceUrl: `https://checkout.test/${id}`,
      expiresAt: new Date(Date.now() + input.durationSec * 1000),
      feesPaidAmount: null,
    };
    this.invoices.set(id, invoice);
    if (this.loseNextCreateResponse) {
      this.loseNextCreateResponse = false;
      throw new PaymentProviderError("fake timeout", true);
    }
    return { ...invoice };
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    this.getCalls++;
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new PaymentProviderError("not found", false, 404);
    return { ...invoice };
  }

  async findInvoiceByExternalId(externalId: string): Promise<Invoice | null> {
    const found = [...this.invoices.values()].find((i) => i.externalId === externalId);
    return found ? { ...found } : null;
  }

  async refund(_input: RefundInput): Promise<never> {
    throw new PaymentProviderError("not implemented", false);
  }

  verifyCallbackToken(token: string | undefined): boolean {
    return token === this.callbackToken;
  }

  pay(invoiceId: string, paidAmount?: number, status: "PAID" | "SETTLED" = "PAID"): void {
    const invoice = this.invoices.get(invoiceId)!;
    invoice.status = status;
    invoice.paidAmount = paidAmount ?? invoice.amount;
    invoice.feesPaidAmount = 700;
  }

  expire(invoiceId: string): void {
    const invoice = this.invoices.get(invoiceId)!;
    invoice.status = "EXPIRED";
    invoice.expiresAt = new Date(Date.now() - 1000);
  }

  latest(): Invoice {
    return [...this.invoices.values()].at(-1)!;
  }
}
