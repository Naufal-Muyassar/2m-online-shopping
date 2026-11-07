import { z } from "zod";
import { ORDER_STATUSES } from "../constants";
import { orderListQuerySchema } from "./customer";

const uuid = z.string().uuid();

// GET /courier/balance
export const courierBalanceSchema = z.object({ balance: z.number().int() });
export type CourierBalance = z.infer<typeof courierBalanceSchema>;

export const courierIdParamsSchema = z.object({ id: uuid });

// GET /courier/balance/history and GET /admin/couriers/:id/ledger (newest first).
// branch_id is only read for super_admin on the admin route.
export const courierLedgerQuerySchema = orderListQuerySchema.extend({ branch_id: uuid.optional() });
export type CourierLedgerQuery = z.infer<typeof courierLedgerQuerySchema>;

export const courierLedgerEntrySchema = z.object({
  id: uuid,
  type: z.enum(["EARNING", "WITHDRAWAL"]),
  // Signed: earnings are positive, withdrawals negative.
  amount: z.number().int(),
  order_code: z.string().nullable(),
  order_status: z.enum(ORDER_STATUSES).nullable(),
  recorded_by_name: z.string().nullable(),
  created_at: z.string(),
});
export type CourierLedgerEntry = z.infer<typeof courierLedgerEntrySchema>;

export const courierLedgerResponseSchema = z.object({
  entries: z.array(courierLedgerEntrySchema),
  next_cursor: z.string().nullable(),
});
export type CourierLedgerResponse = z.infer<typeof courierLedgerResponseSchema>;

// POST /admin/couriers/:id/withdrawals (branch_admin of the courier's branch)
export const courierWithdrawalRequestSchema = z.object({
  amount: z.number().int().positive(),
  idempotency_key: uuid,
});
export type CourierWithdrawalRequest = z.infer<typeof courierWithdrawalRequestSchema>;

export const courierWithdrawalResponseSchema = z.object({
  id: uuid,
  amount: z.number().int().positive(),
  balance: z.number().int(),
  created_at: z.string(),
});
export type CourierWithdrawalResponse = z.infer<typeof courierWithdrawalResponseSchema>;
