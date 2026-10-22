import axios from "axios";
import { createApiClient } from "@2m/shared";

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn;
};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const api = createApiClient({
  platform: "courier-pwa",
  appVersion: "0.0.0",
  getToken: () => accessToken,
  setToken: (token) => {
    const hadToken = accessToken !== null;
    accessToken = token;
    if (token === null && hadToken) onSessionLost?.();
  },
});

const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Nomor HP atau kata sandi salah.",
  COURIER_BUSY: "Status tidak bisa diubah saat sedang mengantar.",
  PROOF_REQUIRED: "Foto bukti pengiriman wajib diunggah.",
  INVALID_TRANSITION: "Status pesanan sudah berubah. Muat ulang halaman.",
  INVALID_STATE: "Status pesanan sudah berubah. Muat ulang halaman.",
};

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "Tidak ada koneksi. Periksa internet Anda lalu coba lagi.";
    const data = error.response.data as { error?: { code?: string; message?: string } } | undefined;
    const code = data?.error?.code;
    return (code && CODE_MESSAGES[code]) || data?.error?.message || `Terjadi kesalahan (${error.response.status}).`;
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan.";
}
