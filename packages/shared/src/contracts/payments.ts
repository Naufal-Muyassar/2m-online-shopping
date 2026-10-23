import { z } from "zod";

// Body of the Xendit invoice callback. Only identifiers are read from it; status and amounts always come from a re-fetch.
export const xenditInvoiceCallbackSchema = z
  .object({
    id: z.string().min(1),
    external_id: z.string().optional(),
    status: z.string().min(1),
  })
  .passthrough();
export type XenditInvoiceCallback = z.infer<typeof xenditInvoiceCallbackSchema>;

// GET /dev/mock-payments/:invoiceId (dev only, PAYMENT_PROVIDER=mock)
export const mockInvoiceSchema = z.object({
  invoice_id: z.string(),
  external_id: z.string(),
  order_id: z.string().uuid().nullable(),
  amount: z.number().int(),
  method: z.string(),
  status: z.enum(["PENDING", "PAID", "EXPIRED"]),
  expires_at: z.string(),
  paid_at: z.string().nullable(),
});
export type MockInvoice = z.infer<typeof mockInvoiceSchema>;
