import { z } from "zod";
import { COURIER_STATUSES, ORDER_STATUSES } from "../constants";

// super_admin names the branch explicitly; branch_admin's comes from the token
export const adminBranchQuerySchema = z.object({ branch_id: z.string().uuid().optional() });

// GET /branches (public; also feeds the super_admin branch switcher)
export const branchesResponseSchema = z.object({
  branches: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      service_radius_m: z.number().int(),
    }),
  ),
});
export type BranchesResponse = z.infer<typeof branchesResponseSchema>;

// GET /admin/orders
export const adminOrderSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: z.enum(ORDER_STATUSES),
  grand_total: z.number().int(),
  return_pending: z.boolean(),
  created_at: z.string(),
  ready_at: z.string().nullable(),
  last_transition_at: z.string().nullable(),
  assigned_courier: z.object({ user_id: z.string().uuid(), name: z.string() }).nullable(),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;
export const adminOrdersResponseSchema = z.object({ orders: z.array(adminOrderSchema) });
export type AdminOrdersResponse = z.infer<typeof adminOrdersResponseSchema>;

// GET /admin/couriers
export const adminCourierSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  partner_name: z.string(),
  status: z.enum(COURIER_STATUSES),
  last_status_change: z.string(),
  last_ping_at: z.string().nullable(),
  current_order: z.object({ id: z.string().uuid(), code: z.string(), status: z.enum(ORDER_STATUSES) }).nullable(),
});
export type AdminCourier = z.infer<typeof adminCourierSchema>;
export const adminCouriersResponseSchema = z.object({ couriers: z.array(adminCourierSchema) });
export type AdminCouriersResponse = z.infer<typeof adminCouriersResponseSchema>;

// POST /admin/orders/:id/confirm-return (branch_admin, no body)
export const confirmReturnResponseSchema = z.object({ order_id: z.string().uuid() });
export type ConfirmReturnResponse = z.infer<typeof confirmReturnResponseSchema>;
