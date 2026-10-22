import type { PaymentMethod } from "@2m/shared";

export type InvoiceStatus = "PENDING" | "PAID" | "SETTLED" | "EXPIRED";

export interface Invoice {
  id: string;
  externalId: string;
  status: InvoiceStatus;
  amount: number;
  paidAmount: number | null;
  invoiceUrl: string;
  expiresAt: Date;
  feesPaidAmount: number | null;
}

export interface CreateInvoiceInput {
  externalId: string;
  amount: number;
  durationSec: number;
  description: string;
  paymentMethod: PaymentMethod;
  successRedirectUrl: string;
  failureRedirectUrl: string;
}

export interface RefundInput {
  invoiceId: string;
  amount: number;
  reason: string;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export interface PaymentProvider {
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  findInvoiceByExternalId(externalId: string): Promise<Invoice | null>;
  // Signature only: refunds are out of scope until the refunds module exists.
  refund(input: RefundInput): Promise<never>;
  verifyCallbackToken(token: string | undefined): boolean;
}
