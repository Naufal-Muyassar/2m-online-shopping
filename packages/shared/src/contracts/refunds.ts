import { z } from "zod";

const uuid = z.string().uuid();

// A refund is money the store owes a customer for one order. It is opened by the system (paid order cancelled,
// items short at picking, payment that landed after cancellation) or by an admin, and it is closed only with a
// transfer reference and a photo of the transfer receipt, which the customer can see.
export const REFUND_STATUSES = ["NEEDS_DESTINATION", "READY", "COMPLETED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = ["ORDER_CANCELLED", "ITEM_SHORTAGE", "LATE_PAYMENT", "OTHER"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  ORDER_CANCELLED: "Pesanan dibatalkan setelah dibayar",
  ITEM_SHORTAGE: "Sebagian barang tidak tersedia",
  LATE_PAYMENT: "Pembayaran masuk setelah pesanan dibatalkan",
  OTHER: "Pengembalian dana dari toko",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  NEEDS_DESTINATION: "Isi rekening tujuan",
  READY: "Diproses toko",
  COMPLETED: "Selesai",
};

export const REFUND_METHODS = ["BANK", "EWALLET"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const REFUND_PROVIDERS: Record<RefundMethod, readonly string[]> = {
  BANK: ["BCA", "BNI", "BRI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Lainnya"],
  EWALLET: ["GoPay", "OVO", "DANA", "ShopeePay", "LinkAja"],
};

// PUT /orders/:id/refunds/:refundId/destination (customer)
export const refundDestinationRequestSchema = z
  .object({
    method: z.enum(REFUND_METHODS),
    provider: z.string().trim().min(2).max(40),
    account_no: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^\+?[0-9]{6,20}$/, "Nomor rekening atau nomor HP tidak valid")),
    account_name: z.string().trim().min(2).max(80),
  })
  .refine((d) => REFUND_PROVIDERS[d.method].includes(d.provider), { path: ["provider"], message: "Pilih bank atau e-wallet dari daftar" });
export type RefundDestinationRequest = z.infer<typeof refundDestinationRequestSchema>;
export const refundParamsSchema = z.object({ id: uuid, refundId: uuid });

// As the customer sees it: the account number is masked, the receipt is a short-lived link.
export const customerRefundSchema = z.object({
  id: uuid,
  amount: z.number().int().positive(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().nullable(),
  status: z.enum(REFUND_STATUSES),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  destination: z
    .object({ method: z.enum(REFUND_METHODS), provider: z.string(), account_masked: z.string(), account_name: z.string() })
    .nullable(),
  transfer_ref: z.string().nullable(),
  proof_url: z.string().nullable(),
});
export type CustomerRefund = z.infer<typeof customerRefundSchema>;

// GET /admin/refunds?state=open|completed (branch scoped)
export const adminRefundsQuerySchema = z.object({
  state: z.enum(["open", "completed"]).default("open"),
  branch_id: uuid.optional(),
});
export type AdminRefundsQuery = z.infer<typeof adminRefundsQuerySchema>;

export const adminRefundSchema = z.object({
  id: uuid,
  order_id: uuid,
  order_code: z.string(),
  order_status: z.string(),
  customer_name: z.string(),
  amount: z.number().int().positive(),
  reason: z.enum(REFUND_REASONS),
  note: z.string().nullable(),
  status: z.enum(REFUND_STATUSES),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  completed_by_name: z.string().nullable(),
  destination: z
    .object({ method: z.enum(REFUND_METHODS), provider: z.string(), account_no: z.string(), account_name: z.string() })
    .nullable(),
  transfer_ref: z.string().nullable(),
  proof_url: z.string().nullable(),
});
export type AdminRefund = z.infer<typeof adminRefundSchema>;
export const adminRefundsResponseSchema = z.object({ refunds: z.array(adminRefundSchema) });
export type AdminRefundsResponse = z.infer<typeof adminRefundsResponseSchema>;

// POST /admin/refunds (manual refund for a paid order, by order code)
export const adminCreateRefundRequestSchema = z.object({
  order_code: z.string().trim().toUpperCase().min(4).max(40),
  amount: z.number().int().positive(),
  note: z.string().trim().min(3).max(300),
  idempotency_key: uuid,
});
export type AdminCreateRefundRequest = z.infer<typeof adminCreateRefundRequestSchema>;

export const refundIdParamsSchema = z.object({ id: uuid });

// POST /admin/refunds/:id/proof-upload-url → PUT the JPEG to upload_url, then complete with the key.
export const refundProofUploadResponseSchema = z.object({ upload_url: z.string(), proof_key: z.string() });
export type RefundProofUploadResponse = z.infer<typeof refundProofUploadResponseSchema>;

// POST /admin/refunds/:id/complete
export const adminCompleteRefundRequestSchema = z.object({
  transfer_ref: z.string().trim().min(3).max(80),
  proof_key: z.string().min(1).max(200),
});
export type AdminCompleteRefundRequest = z.infer<typeof adminCompleteRefundRequestSchema>;
