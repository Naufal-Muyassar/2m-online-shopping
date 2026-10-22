import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@2m/shared";
import {
  PaymentProviderError,
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceStatus,
  type PaymentProvider,
  type RefundInput,
} from "./provider";

export interface XenditConfig {
  secretKey: string;
  callbackToken: string;
  baseUrl: string;
  timeoutMs?: number;
}

// Restricts the hosted invoice page to the method the customer picked at checkout.
const XENDIT_METHODS: Record<PaymentMethod, string[]> = {
  QRIS: ["QRIS"],
  VA_BCA: ["BCA"],
  VA_BNI: ["BNI"],
  VA_BRI: ["BRI"],
  VA_MANDIRI: ["MANDIRI"],
  EWALLET: ["OVO", "DANA", "SHOPEEPAY", "LINKAJA"],
};

const KNOWN_STATUSES: readonly string[] = ["PENDING", "PAID", "SETTLED", "EXPIRED"];

const sha256 = (v: string) => createHash("sha256").update(v).digest();

interface XenditInvoiceResponse {
  id?: unknown;
  external_id?: unknown;
  status?: unknown;
  amount?: unknown;
  paid_amount?: unknown;
  invoice_url?: unknown;
  expiry_date?: unknown;
  fees_paid_amount?: unknown;
}

const asInt = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export function parseInvoice(raw: XenditInvoiceResponse): Invoice {
  const amount = asInt(raw.amount);
  if (typeof raw.id !== "string" || typeof raw.external_id !== "string" || amount === null || typeof raw.invoice_url !== "string") {
    throw new PaymentProviderError("Unexpected Xendit invoice response", false);
  }
  const status = typeof raw.status === "string" && KNOWN_STATUSES.includes(raw.status) ? (raw.status as InvoiceStatus) : "PENDING";
  const expiresAt = typeof raw.expiry_date === "string" ? new Date(raw.expiry_date) : new Date(NaN);
  return {
    id: raw.id,
    externalId: raw.external_id,
    status,
    amount,
    paidAmount: asInt(raw.paid_amount),
    invoiceUrl: raw.invoice_url,
    expiresAt: Number.isNaN(expiresAt.getTime()) ? new Date(0) : expiresAt,
    feesPaidAmount: asInt(raw.fees_paid_amount),
  };
}

export class XenditAdapter implements PaymentProvider {
  private readonly auth: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly cfg: XenditConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.auth = `Basic ${Buffer.from(`${cfg.secretKey}:`).toString("base64")}`;
    this.timeoutMs = cfg.timeoutMs ?? 5000;
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.auth, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new PaymentProviderError(`Xendit request failed: ${err instanceof Error ? err.name : "error"}`, true);
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
      throw new PaymentProviderError(`Xendit responded ${res.status}`, retryable, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new PaymentProviderError("Xendit returned a non-JSON body", true);
    }
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const raw = await this.request("POST", "/v2/invoices", {
      external_id: input.externalId,
      amount: input.amount,
      currency: "IDR",
      invoice_duration: input.durationSec,
      description: input.description,
      payment_methods: XENDIT_METHODS[input.paymentMethod],
      success_redirect_url: input.successRedirectUrl,
      failure_redirect_url: input.failureRedirectUrl,
    });
    return parseInvoice(raw as XenditInvoiceResponse);
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    return parseInvoice((await this.request("GET", `/v2/invoices/${encodeURIComponent(invoiceId)}`)) as XenditInvoiceResponse);
  }

  async findInvoiceByExternalId(externalId: string): Promise<Invoice | null> {
    const raw = await this.request("GET", `/v2/invoices?external_id=${encodeURIComponent(externalId)}`);
    if (!Array.isArray(raw)) throw new PaymentProviderError("Unexpected Xendit invoice list response", false);
    const match = (raw as XenditInvoiceResponse[]).find((i) => i.external_id === externalId);
    return match ? parseInvoice(match) : null;
  }

  async refund(_input: RefundInput): Promise<never> {
    throw new PaymentProviderError("Refunds are not implemented", false);
  }

  // Hashing first makes both buffers the same length, so timingSafeEqual never throws and length does not leak.
  verifyCallbackToken(token: string | undefined): boolean {
    if (!token) return false;
    return timingSafeEqual(sha256(token), sha256(this.cfg.callbackToken));
  }
}
