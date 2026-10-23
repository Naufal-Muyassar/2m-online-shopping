import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  PaymentProviderError,
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceStatus,
  type PaymentProvider,
  type RefundInput,
} from "./provider";

interface MockInvoiceRow {
  invoice_id: string;
  external_id: string;
  amount: number;
  method: string;
  status: InvoiceStatus;
  expires_at: Date;
  paid_at: Date | null;
}

// A PENDING invoice past its expiry reads as EXPIRED, like the hosted Xendit invoice does.
const COLUMNS = `invoice_id, external_id, amount, method, expires_at, paid_at,
  CASE WHEN status = 'PENDING' AND expires_at <= now() THEN 'EXPIRED' ELSE status END AS status`;

// Dev/demo stand-in for Xendit, backed by the mock_invoices table. Never selected in production (see env.ts).
export class MockAdapter implements PaymentProvider {
  constructor(
    private readonly db: Pick<Pool, "query">,
    private readonly customerWebUrl: string,
  ) {}

  private toInvoice(r: MockInvoiceRow): Invoice {
    return {
      id: r.invoice_id,
      externalId: r.external_id,
      status: r.status,
      amount: r.amount,
      paidAmount: r.status === "PAID" ? r.amount : null,
      invoiceUrl: `${this.customerWebUrl}/mock-pay/${r.invoice_id}`,
      expiresAt: r.expires_at,
      feesPaidAmount: null,
    };
  }

  // Safe to call again with the same externalId: the existing invoice is returned.
  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const res = await this.db.query<MockInvoiceRow>(
      `INSERT INTO mock_invoices (invoice_id, external_id, amount, method, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))
       ON CONFLICT (external_id) DO UPDATE SET external_id = EXCLUDED.external_id
       RETURNING ${COLUMNS}`,
      [randomUUID(), input.externalId, input.amount, input.paymentMethod, input.durationSec],
    );
    return this.toInvoice(res.rows[0]!);
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    const res = await this.db.query<MockInvoiceRow>(`SELECT ${COLUMNS} FROM mock_invoices WHERE invoice_id = $1`, [invoiceId]);
    if (!res.rows[0]) throw new PaymentProviderError("Mock invoice not found", false, 404);
    return this.toInvoice(res.rows[0]);
  }

  async findInvoiceByExternalId(externalId: string): Promise<Invoice | null> {
    const res = await this.db.query<MockInvoiceRow>(`SELECT ${COLUMNS} FROM mock_invoices WHERE external_id = $1`, [externalId]);
    return res.rows[0] ? this.toInvoice(res.rows[0]) : null;
  }

  async refund(_input: RefundInput): Promise<never> {
    throw new PaymentProviderError("Refunds are not implemented", false);
  }

  // The mock has no gateway callbacks, so the Xendit webhook is always refused.
  verifyCallbackToken(_token: string | undefined): boolean {
    return false;
  }

  // Only a live PENDING invoice can be paid; anything else leaves the row as it is (paying twice is a no-op).
  async pay(invoiceId: string): Promise<Invoice> {
    await this.db.query(
      `UPDATE mock_invoices SET status = 'PAID', paid_at = now()
       WHERE invoice_id = $1 AND status = 'PENDING' AND expires_at > now()`,
      [invoiceId],
    );
    return this.getInvoice(invoiceId);
  }

  async expire(invoiceId: string): Promise<Invoice> {
    await this.db.query(`UPDATE mock_invoices SET status = 'EXPIRED' WHERE invoice_id = $1 AND status = 'PENDING'`, [invoiceId]);
    return this.getInvoice(invoiceId);
  }

  // Dev page data; order_id is resolved through the invoice the order was linked to.
  async describe(invoiceId: string): Promise<(Invoice & { method: string; paidAt: Date | null; orderId: string | null }) | null> {
    const res = await this.db.query<MockInvoiceRow & { order_id: string | null }>(
      `SELECT m.invoice_id, m.external_id, m.amount, m.method, m.expires_at, m.paid_at,
              CASE WHEN m.status = 'PENDING' AND m.expires_at <= now() THEN 'EXPIRED' ELSE m.status END AS status,
              o.id AS order_id
       FROM mock_invoices m LEFT JOIN orders o ON o.invoice_id = m.invoice_id
       WHERE m.invoice_id = $1`,
      [invoiceId],
    );
    const r = res.rows[0];
    return r ? { ...this.toInvoice(r), method: r.method, paidAt: r.paid_at, orderId: r.order_id } : null;
  }
}
