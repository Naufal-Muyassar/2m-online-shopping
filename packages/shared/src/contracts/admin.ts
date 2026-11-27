import { z } from "zod";
import { COURIER_STATUSES, ORDER_STATUSES } from "../constants";

// super_admin names the branch explicitly; branch_admin's comes from the token
export const adminBranchQuerySchema = z.object({ branch_id: z.string().uuid().optional() });

// GET /admin/orders. Without date: the live board. With date: every order created that day in the
// branch's timezone, whatever its status.
export const adminOrdersQuerySchema = adminBranchQuerySchema.extend({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

// POST /admin/orders/:id/cancel. branch_admin may cancel PAID and ACCEPTED orders; super_admin also
// PICKING and READY (the transition table decides). Reserved stock goes back to the branch.
export const adminCancelRequestSchema = z.object({
  branch_id: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(200),
  idempotency_key: z.string().uuid().optional(),
});
export type AdminCancelRequest = z.infer<typeof adminCancelRequestSchema>;

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
  receiver_name: z.string(),
  area_hint: z.string(),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  items: z.array(z.object({ name: z.string(), qty: z.number().int() })),
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
  motor_cluster: z.string().nullable().optional(),
  balance: z.number().int(),
  // Last known position; null while OFFLINE, so a courier off duty is not on the map.
  position: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  current_order: z.object({ id: z.string().uuid(), code: z.string(), status: z.enum(ORDER_STATUSES) }).nullable(),
});
export type AdminCourier = z.infer<typeof adminCourierSchema>;
export const adminCouriersResponseSchema = z.object({ couriers: z.array(adminCourierSchema) });
export type AdminCouriersResponse = z.infer<typeof adminCouriersResponseSchema>;

// POST /admin/orders/:id/confirm-return (branch_admin, no body)
export const confirmReturnResponseSchema = z.object({ order_id: z.string().uuid() });
export type ConfirmReturnResponse = z.infer<typeof confirmReturnResponseSchema>;

// GET /admin/courier-partners: active partners a new courier can be signed to.
export const courierPartnersResponseSchema = z.object({
  partners: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type CourierPartnersResponse = z.infer<typeof courierPartnersResponseSchema>;

// POST /admin/couriers. The courier signs in to the courier app with the phone and this password;
// super_admin passes branch_id.
export const createCourierRequestSchema = z.object({
  branch_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^\+?[0-9]{8,16}$/, "Nomor telepon tidak valid"),
  password: z.string().min(8).max(100),
  partner_id: z.string().uuid(),
});
export type CreateCourierRequest = z.infer<typeof createCourierRequestSchema>;
export const createCourierResponseSchema = z.object({
  courier: z.object({ user_id: z.string().uuid(), name: z.string(), phone: z.string() }),
});
export type CreateCourierResponse = z.infer<typeof createCourierResponseSchema>;

// GET /admin/couriers/:id/releases: orders the courier gave back, newest first, with the reason given.
export const courierReleaseSchema = z.object({
  order_id: z.string().uuid(),
  order_code: z.string(),
  reason: z.string(),
  released_at: z.string(),
});
export type CourierRelease = z.infer<typeof courierReleaseSchema>;
export const courierReleasesResponseSchema = z.object({ releases: z.array(courierReleaseSchema) });
export type CourierReleasesResponse = z.infer<typeof courierReleasesResponseSchema>;
