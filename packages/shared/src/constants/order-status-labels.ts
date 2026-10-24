import type { OrderStatus } from "./order-status";

// What the customer sees. READY and ASSIGNED are dormant statuses, mapped to the picking step.
export const CUSTOMER_STATUS_LABELS: Record<OrderStatus, string> = {
  CREATED: "Pesanan dibuat",
  PENDING_PAYMENT: "Menunggu pembayaran",
  PAID: "Pembayaran diterima",
  ACCEPTED: "Pesanan diterima toko, mencari kurir",
  PICKING: "Sedang disiapkan",
  READY: "Sedang disiapkan",
  ASSIGNED: "Sedang disiapkan",
  ON_DELIVERY: "Dalam perjalanan",
  DELIVERED: "Selesai",
  FAILED: "Gagal diantar",
  CANCELLED: "Dibatalkan",
};

export const CUSTOMER_TIMELINE: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "PICKING",
  "ON_DELIVERY",
  "DELIVERED",
];
