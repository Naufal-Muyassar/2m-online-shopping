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
  platform: "admin-web",
  appVersion: "0.0.0",
  getToken: () => accessToken,
  setToken: (token) => {
    accessToken = token;
    if (!token) onSessionLost();
  },
});

const CODE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE: "Saldo kurir tidak cukup. Periksa saldo terbaru lalu coba lagi.",
  IDEMPOTENCY_CONFLICT: "Penarikan ini sudah tercatat dengan jumlah lain. Periksa riwayat saldo kurir.",
  ACCOUNT_EXISTS: "No. HP atau email sudah dipakai akun lain.",
  PRODUCT_NOT_FOUND: "Produk ini tidak ada di cabang ini. Muat ulang daftar produk.",
  BRANCH_NOT_FOUND: "Cabang tidak ditemukan. Muat ulang halaman.",
  TEMPLATE_INCOMPLETE: "Cabang contoh belum punya tarif ongkir atau batas pesanan. Pilih cabang lain.",
  STOCK_UNAVAILABLE: "Stok sedang tidak bisa diperbarui. Coba lagi sebentar lagi.",
  VALIDATION_ERROR: "Isian belum valid. Periksa lagi kolom yang ditandai.",
  FORBIDDEN: "Akun ini tidak punya akses untuk tindakan itu.",
  PRODUCT_ALREADY_IN_BRANCH: "Produk ini sudah dijual di cabang ini. Cari di daftar produk untuk mengubah harga atau stoknya.",
  INVALID_TRANSITION: "Status order sudah berubah, jadi tindakan ini tidak bisa lagi. Muat ulang daftar order.",
  ORDER_NOT_FOUND: "Order tidak ditemukan di cabang ini.",
  ADMIN_NOT_FOUND: "Akun admin tidak ditemukan. Muat ulang daftar cabang.",
  SKU_EXISTS: "SKU itu sudah ada di katalog. Pakai SKU lain atau ubah produk yang sudah ada.",
};

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const error = (err.response?.data as { error?: { code?: string; message?: string } } | undefined)?.error;
    return (error?.code && CODE_MESSAGES[error.code]) || (error?.message ?? err.message);
  }
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}
