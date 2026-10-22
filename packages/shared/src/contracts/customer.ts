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

export const customerOrderDetailSchema = orderSummarySchema.extend({
  // Only set while the order is PENDING_PAYMENT, so the customer can resume payment.
  invoice_url: z.string().nullable(),
  invoice_expires_at: z.string().nullable(),
  subtotal: z.number().int(),
  delivery_fee: z.number().int(),
  payment_fee: z.number().int(),
  voucher_discount: z.number().int(),
  payment_method: z.string().nullable(),
  items: z.array(
    z.object({ name: z.string(), unit_price: z.number().int(), qty: z.number().int(), sku: z.string() }),
  ),
  timeline: z.array(z.object({ status: z.enum(ORDER_STATUSES), at: z.string(), reason: z.string().nullable() })),
});
export type CustomerOrderDetail = z.infer<typeof customerOrderDetailSchema>;
