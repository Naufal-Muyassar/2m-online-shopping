import { z } from "zod";
import { ORDER_STATUSES } from "../constants";

export const PAYMENT_METHODS = ["QRIS", "VA_BCA", "VA_BNI", "VA_BRI", "VA_MANDIRI", "EWALLET"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

const uuid = z.string().uuid();

// GET /branches (public)
export const branchSchema = z.object({
  id: uuid,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  service_radius_m: z.number().int(),
});
export type Branch = z.infer<typeof branchSchema>;

// GET /branches/:id/products
export const productsQuerySchema = z.object({
  category: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const STOCK_STATUSES = ["available", "low", "out"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const productSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string(),
  weight_kg: z.number(),
  price: z.number().int(),
  sellable_qty: z.number().int().min(0),
  stock_status: z.enum(STOCK_STATUSES),
});
export type Product = z.infer<typeof productSchema>;

export const productsResponseSchema = z.object({
  products: z.array(productSchema),
  categories: z.array(z.string()),
  page: z.number().int(),
  page_size: z.number().int(),
  has_more: z.boolean(),
});
export type ProductsResponse = z.infer<typeof productsResponseSchema>;

// Cart
export const cartBranchQuerySchema = z.object({ branch_id: uuid });
export const cartAddSchema = z.object({
  branch_id: uuid,
  product_id: uuid,
  qty: z.number().int().min(1).max(999).default(1),
});
export const cartSetQtySchema = z.object({ branch_id: uuid, qty: z.number().int().min(1).max(999) });
export type CartAddRequest = z.infer<typeof cartAddSchema>;

export const cartItemSchema = z.object({
  product_id: uuid,
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  price: z.number().int(),
  weight_kg: z.number(),
  qty: z.number().int(),
  line_total: z.number().int(),
});
export const cartSchema = z.object({
  branch_id: uuid,
  items: z.array(cartItemSchema),
  subtotal: z.number().int(),
  total_weight_kg: z.number(),
  is_bulk_order: z.boolean(),
  limits: z.object({ max_qty_per_sku: z.number().int(), max_order_weight_kg: z.number(), min_order: z.number().int() }),
});
export type Cart = z.infer<typeof cartSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;

// Addresses
export const addressInputSchema = z.object({
  branch_id: uuid,
  label: z.string().trim().min(1).max(40),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  street: z.string().trim().min(1).max(300),
  rt_rw: z.string().trim().max(20).nullish(),
  unit: z.string().trim().max(60).nullish(),
  receiver_name: z.string().trim().min(1).max(100),
  receiver_phone: z.string().trim().regex(/^\+?[0-9]{8,16}$/, "Nomor telepon tidak valid"),
  courier_note: z.string().trim().max(300).nullish(),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export const addressSchema = addressInputSchema.omit({ branch_id: true }).extend({ id: uuid });
export type Address = z.infer<typeof addressSchema>;

// POST /calculate-price
export const calculatePriceRequestSchema = z.object({
  branch_id: uuid,
  address_id: uuid,
  voucher_code: z.string().trim().min(1).max(40).optional(),
  payment_method: paymentMethodSchema,
});
export type CalculatePriceRequest = z.infer<typeof calculatePriceRequestSchema>;

export const priceBreakdownSchema = z.object({
  subtotal: z.number().int(),
  base_delivery_fee: z.number().int(),
  weight_surcharge: z.number().int(),
  voucher_discount: z.number().int(),
  final_shipping_cost: z.number().int(),
  payment_fee: z.number().int(),
  grand_total: z.number().int(),
  distance_km: z.number(),
  route_distance_km: z.number(),
  total_weight_kg: z.number(),
});
export type PriceBreakdown = z.infer<typeof priceBreakdownSchema>;

// POST /orders
export const createOrderRequestSchema = calculatePriceRequestSchema;
export type CreateOrderRequest = CalculatePriceRequest;

export const orderSummarySchema = z.object({
  id: uuid,
  code: z.string(),
  status: z.enum(ORDER_STATUSES),
  grand_total: z.number().int(),
  created_at: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

// POST /orders response: the customer is redirected to invoice_url (Xendit hosted payment page).
export const createdOrderSchema = orderSummarySchema.extend({ invoice_url: z.string().url() });
export type CreatedOrder = z.infer<typeof createdOrderSchema>;

// GET /orders?cursor=&limit= (customer, own orders, newest first)
export const orderListQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const orderListItemSchema = z.object({
  id: uuid,
  code: z.string(),
  status: z.enum(ORDER_STATUSES),
  created_at: z.string(),
  grand_total: z.number().int(),
  item_count: z.number().int(),
  branch_name: z.string(),
});
export type OrderListItem = z.infer<typeof orderListItemSchema>;

export const orderListResponseSchema = z.object({
  orders: z.array(orderListItemSchema),
  next_cursor: z.string().nullable(),
});
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

export const FAILURE_LABELS: Record<string, string> = {
  CUSTOMER_UNREACHABLE: "Kurir tidak dapat menghubungi penerima",
  ADDRESS_NOT_FOUND: "Alamat tidak ditemukan",
  REFUSED: "Pesanan ditolak penerima",
};
export const FAILURE_LABEL_DEFAULT = "Pengantaran tidak berhasil";

// GET /orders/:id response. Built field by field through this schema (a whitelist), never from raw DB rows.
export const customerOrderDetailSchema = z.object({
  order: z.object({
    id: uuid,
    code: z.string(),
    status: z.enum(ORDER_STATUSES),
    created_at: z.string(),
    paid_at: z.string().nullable(),
    branch_name: z.string(),
  }),
  // Only set while the order is PENDING_PAYMENT, so the customer can resume payment.
  invoice_url: z.string().nullable(),
  invoice_expires_at: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      unit: z.string(),
      qty: z.number().int(),
      picked_qty: z.number().int(),
      unit_price: z.number().int(),
      line_total: z.number().int(),
    }),
  ),
  pricing: z.object({
    subtotal: z.number().int(),
    delivery_fee: z.number().int(),
    voucher_discount: z.number().int(),
    payment_fee: z.number().int(),
    grand_total: z.number().int(),
    route_distance_km: z.number().nullable(),
  }),
  address: z.object({
    label: z.string(),
    street: z.string(),
    rt_rw: z.string().nullable(),
    unit: z.string().nullable(),
    receiver_name: z.string(),
    receiver_phone: z.string(),
    courier_note: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
  payment: z.object({ method: z.string().nullable(), paid_at: z.string().nullable() }),
  timeline: z.array(z.object({ status: z.enum(ORDER_STATUSES), at: z.string() })),
  // Set from PICKING onward; never the phone number.
  courier: z.object({ first_name: z.string() }).nullable(),
  failure: z.string().nullable(),
  proof: z.object({ photo_url: z.string(), taken_at: z.string() }).nullable(),
  tracking_available: z.boolean(),
});
export type CustomerOrderDetail = z.infer<typeof customerOrderDetailSchema>;

// GET /orders/:id/tracking. Never carries courier id, phone or ping history.
export const TRACKING_STALE_SEC = 60;
export const trackingResponseSchema = z.discriminatedUnion("active", [
  z.object({ active: z.literal(false), status: z.enum(ORDER_STATUSES) }),
  z.object({
    active: z.literal(true),
    courier: z
      .object({
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number().nullable(),
        updated_at: z.string(),
      })
      .nullable(),
    destination: z.object({ lat: z.number(), lng: z.number() }),
    distance_remaining_km: z.number().nullable(),
    eta_minutes: z.number().int().nullable(),
    stale: z.boolean(),
  }),
]);
export type TrackingResponse = z.infer<typeof trackingResponseSchema>;