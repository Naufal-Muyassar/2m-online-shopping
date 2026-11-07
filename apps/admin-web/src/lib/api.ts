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
};

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const error = (err.response?.data as { error?: { code?: string; message?: string } } | undefined)?.error;
    return (error?.code && CODE_MESSAGES[error.code]) || (error?.message ?? err.message);
  }
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}
