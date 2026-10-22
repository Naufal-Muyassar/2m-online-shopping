import axios from "axios";
import { createApiClient } from "@2m/shared";

let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

export const api = createApiClient({
  platform: "customer-web",
  appVersion: "0.0.0",
  getToken: () => accessToken,
  setToken: (token) => {
    accessToken = token;
    if (!token) onSessionLost();
  },
});

type Details = Record<string, unknown> | undefined;

const MESSAGES: Record<string, (d: Details, fallback: string) => string> = {
  MAX_QTY_EXCEEDED: (d) => `Maksimal ${String(d?.max)} per produk${d?.product ? ` (${String(d.product)})` : ""}.`,
  MAX_WEIGHT_EXCEEDED: (d) => `Total berat pesanan melebihi batas ${String(d?.max)} kg.`,
  OUT_OF_STOCK: (d) => {
    const items = Array.isArray(d?.items) ? (d.items as { name?: string; available?: number }[]) : [];
    if (items.length > 0) {
      const list = items.map((i) => `${i.name ?? "Produk"} (tersedia ${i.available ?? 0})`).join(", ");
      return `Stok tidak mencukupi: ${list}. Kurangi jumlahnya atau hapus dari keranjang.`;
    }
    return `${d?.product ? String(d.product) : "Produk"} sedang habis.`;
  },
  PRODUCT_UNAVAILABLE: () => "Sebagian produk di keranjang tidak lagi dijual di cabang ini.",
  CART_EMPTY: () => "Keranjang masih kosong.",
  MIN_ORDER_NOT_MET: (d) => `Minimal belanja Rp${Number(d?.min_order ?? 0).toLocaleString("id-ID")}.`,
  OUTSIDE_COVERAGE: () => "Lokasi pin di luar jangkauan pengantaran cabang ini.",
  VOUCHER_UNSUPPORTED: () => "Voucher belum tersedia.",
  INVALID_CREDENTIALS: () => "No. HP/email atau password salah.",
  ACCOUNT_EXISTS: () => "No. HP atau email sudah terdaftar.",
  ADDRESS_IN_USE: () => "Alamat dipakai oleh pesanan dan tidak bisa dihapus.",
  VALIDATION_ERROR: (_d, fallback) => fallback,
};

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = (err.response?.data as { error?: { code?: string; message?: string; details?: Details } } | undefined)
      ?.error;
    if (e?.code && MESSAGES[e.code]) return MESSAGES[e.code]!(e.details, "Data yang dimasukkan tidak valid.");
    return e?.message ?? err.message;
  }
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}
