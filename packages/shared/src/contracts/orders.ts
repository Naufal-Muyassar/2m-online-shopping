import { z } from "zod";
import { ORDER_STATUSES } from "../constants";

export const orderSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  branch_id: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
  grand_total: z.number().int(),
  assigned_courier_id: z.string().uuid().nullable(),
  return_pending: z.boolean(),
  ready_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  updated_at: z.string(),
});
export type OrderDto = z.infer<typeof orderSchema>;

export const orderTransitionResponseSchema = z.object({
  order: orderSchema,
  replayed: z.boolean(),
});
export type OrderTransitionResponse = z.infer<typeof orderTransitionResponseSchema>;

export const orderIdParamsSchema = z.object({ id: z.string().uuid() });

// POST /admin/orders/:id/transition (branch_admin)
export const ADMIN_TRANSITION_TARGETS = ["ACCEPTED"] as const;
export const adminTransitionRequestSchema = z.object({
  to: z.enum(ADMIN_TRANSITION_TARGETS),
  idempotency_key: z.string().uuid().optional(),
});
export type AdminTransitionRequest = z.infer<typeof adminTransitionRequestSchema>;

// POST /admin/orders/:id/assign (branch_admin, ACCEPTED → PICKING)
export const adminAssignRequestSchema = z.object({
  courier_id: z.string().uuid(),
  idempotency_key: z.string().uuid().optional(),
});
export type AdminAssignRequest = z.infer<typeof adminAssignRequestSchema>;

// POST /admin/orders/:id/release (branch_admin, PICKING → ACCEPTED)
export const adminReleaseRequestSchema = z.object({
  reason: z.string().trim().min(1).max(200),
  idempotency_key: z.string().uuid().optional(),
});
export type AdminReleaseRequest = z.infer<typeof adminReleaseRequestSchema>;

// POST /admin/orders/:id/force-paid (super_admin, DEMO)
export const forcePaidRequestSchema = z.object({
  idempotency_key: z.string().uuid().optional(),
});
export type ForcePaidRequest = z.infer<typeof forcePaidRequestSchema>;
