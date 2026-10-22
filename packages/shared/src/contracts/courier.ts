import { z } from "zod";
import { COURIER_STATUSES, FAILED_REASONS, ORDER_STATUSES } from "../constants";

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const courierMeSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  branch_id: z.string().uuid(),
  partner_id: z.string().uuid(),
  status: z.enum(COURIER_STATUSES),
  last_status_change: z.string(),
  last_ping_at: z.string().nullable(),
});
export type CourierMe = z.infer<typeof courierMeSchema>;

// PUT /courier/status
export const COURIER_TOGGLE_STATUSES = ["IDLE", "OFFLINE"] as const;
export const courierStatusRequestSchema = z.object({ status: z.enum(COURIER_TOGGLE_STATUSES) });
export type CourierStatusRequest = z.infer<typeof courierStatusRequestSchema>;
export const courierStatusResponseSchema = z.object({ status: z.enum(COURIER_STATUSES) });
export type CourierStatusResponse = z.infer<typeof courierStatusResponseSchema>;

export const courierOrderItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  qty: z.number().int(),
  weight_kg: z.number(),
});

export const courierOrderSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  status: z.enum(ORDER_STATUSES),
  return_pending: z.boolean(),
  grand_total: z.number().int(),
  ready_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  updated_at: z.string(),
  items: z.array(courierOrderItemSchema),
  address: z.object({
    street: z.string(),
    rt_rw: z.string().nullable(),
    unit: z.string().nullable(),
    courier_note: z.string().nullable(),
    receiver_name: z.string(),
    receiver_phone: z.string(),
    lat,
    lng,
  }),
});
export type CourierOrder = z.infer<typeof courierOrderSchema>;

// GET /courier/orders
export const courierOrdersResponseSchema = z.object({
  active: z.array(courierOrderSchema),
  recent: z.array(courierOrderSchema),
});
export type CourierOrdersResponse = z.infer<typeof courierOrdersResponseSchema>;

// POST /courier/orders/:id/status
export const COURIER_STATUS_TARGETS = ["ON_DELIVERY", "DELIVERED", "FAILED"] as const;
export const courierOrderStatusRequestSchema = z.object({
  to: z.enum(COURIER_STATUS_TARGETS),
  lat,
  lng,
  accuracy: z.number().min(0),
  client_ts: z.string().datetime({ offset: true }),
  idempotency_key: z.string().uuid(),
  reason: z.enum(FAILED_REASONS).optional(),
  note: z.string().max(500).optional(),
});
export type CourierOrderStatusRequest = z.infer<typeof courierOrderStatusRequestSchema>;

// POST /courier/orders/:id/proof/upload-url (no body)
export const proofUploadUrlResponseSchema = z.object({
  upload_url: z.string().url(),
  photo_key: z.string(),
});
export type ProofUploadUrlResponse = z.infer<typeof proofUploadUrlResponseSchema>;

// POST /courier/orders/:id/proof
export const proofRegisterRequestSchema = z.object({
  photo_key: z.string().min(1).max(200),
  lat,
  lng,
});
export type ProofRegisterRequest = z.infer<typeof proofRegisterRequestSchema>;
export const proofRegisterResponseSchema = z.object({ photo_key: z.string() });
export type ProofRegisterResponse = z.infer<typeof proofRegisterResponseSchema>;

// POST /courier/pings
export const pingSchema = z.object({
  lat,
  lng,
  accuracy: z.number().min(0),
  battery: z.number().int().min(0).max(100).optional(),
  order_id: z.string().uuid().optional(),
  client_ts: z.string().datetime({ offset: true }),
});
export const pingsRequestSchema = z.object({ pings: z.array(pingSchema).min(1).max(50) });
export type PingsRequest = z.infer<typeof pingsRequestSchema>;
export const pingsResponseSchema = z.object({ accepted: z.number().int() });
export type PingsResponse = z.infer<typeof pingsResponseSchema>;
