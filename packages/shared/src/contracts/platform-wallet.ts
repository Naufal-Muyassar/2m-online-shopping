import { z } from "zod";

const uuid = z.string().uuid();

// Dompet 2M: the buffer filled by the gap between the ongkir a customer pays and the courier's wage. It is not
// profit. It covers the ongkir refunded on failed deliveries (and the courier's failed pay), long-distance orders
// whose ongkir is below the wage, ongkir vouchers, and running costs such as the Google Maps API. A negative
// balance means 2M covers the gap from its goods margin; a TOP_UP records that transfer.
export const PLATFORM_WALLET_TYPES = ["ONGKIR_IN", "COURIER_PAY", "ONGKIR_REFUND", "VOUCHER", "EXPENSE", "TOP_UP"] as const;
export type PlatformWalletType = (typeof PLATFORM_WALLET_TYPES)[number];

export const PLATFORM_WALLET_TYPE_LABELS: Record<PlatformWalletType, string> = {
  ONGKIR_IN: "Ongkir dibayar pelanggan",
  COURIER_PAY: "Upah kurir",
  ONGKIR_REFUND: "Ongkir dikembalikan (gagal antar)",
  VOUCHER: "Voucher ongkir",
  EXPENSE: "Biaya operasional",
  TOP_UP: "Tambahan dari margin barang",
};

export const PLATFORM_EXPENSE_CATEGORIES = ["MAPS_API", "REFUND_COST", "PAYMENT_FEE", "OTHER"] as const;
export type PlatformExpenseCategory = (typeof PLATFORM_EXPENSE_CATEGORIES)[number];

export const PLATFORM_EXPENSE_CATEGORY_LABELS: Record<PlatformExpenseCategory, string> = {
  MAPS_API: "Google Maps API",
  REFUND_COST: "Biaya pengembalian dana",
  PAYMENT_FEE: "Biaya pembayaran",
  OTHER: "Lainnya",
};

// GET /admin/platform-wallet (super_admin). branch_id narrows to one branch (head-office entries are then left out);
// from/to (YYYY-MM-DD, Asia/Jakarta, inclusive) narrow the period summary and the entry list, not the balance.
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");
export const platformWalletQuerySchema = z.object({
  branch_id: uuid.optional(),
  from: day.optional(),
  to: day.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PlatformWalletQuery = z.infer<typeof platformWalletQuerySchema>;

export const platformWalletEntrySchema = z.object({
  id: uuid,
  type: z.enum(PLATFORM_WALLET_TYPES),
  category: z.enum(PLATFORM_EXPENSE_CATEGORIES).nullable(),
  // Signed: money in is positive, money out negative.
  amount: z.number().int(),
  branch_id: uuid.nullable(),
  branch_name: z.string().nullable(),
  order_code: z.string().nullable(),
  note: z.string().nullable(),
  recorded_by_name: z.string().nullable(),
  created_at: z.string(),
});
export type PlatformWalletEntry = z.infer<typeof platformWalletEntrySchema>;

const totalsByType = z.object(Object.fromEntries(PLATFORM_WALLET_TYPES.map((t) => [t, z.number().int()])) as Record<
  PlatformWalletType,
  z.ZodNumber
>);
const totalsByCategory = z.object(
  Object.fromEntries(PLATFORM_EXPENSE_CATEGORIES.map((c) => [c, z.number().int()])) as Record<PlatformExpenseCategory, z.ZodNumber>,
);

export const platformWalletResponseSchema = z.object({
  // All-time balance within the branch filter.
  balance: z.number().int(),
  period: z.object({
    net: z.number().int(),
    by_type: totalsByType,
    expense_by_category: totalsByCategory,
    // Delivered orders whose ongkir is below the courier's pay (long-distance subsidy) and the total gap (≤ 0).
    subsidized_orders: z.number().int(),
    subsidy_total: z.number().int(),
  }),
  entries: z.array(platformWalletEntrySchema),
  next_cursor: z.string().nullable(),
});
export type PlatformWalletResponse = z.infer<typeof platformWalletResponseSchema>;

// POST /admin/platform-wallet/entries (super_admin): a running cost paid from the wallet, or a top-up from the
// goods margin. branch_id null means a head-office cost such as the Google Maps API bill.
export const platformWalletManualRequestSchema = z
  .object({
    type: z.enum(["EXPENSE", "TOP_UP"]),
    category: z.enum(PLATFORM_EXPENSE_CATEGORIES).nullable().default(null),
    amount: z.number().int().positive().max(100_000_000),
    note: z.string().trim().min(3).max(200),
    branch_id: uuid.nullable().default(null),
    idempotency_key: uuid,
  })
  .refine((d) => (d.type === "EXPENSE") === (d.category !== null), {
    path: ["category"],
    message: "Kategori wajib untuk biaya dan tidak dipakai untuk tambahan dana",
  });
export type PlatformWalletManualRequest = z.infer<typeof platformWalletManualRequestSchema>;
