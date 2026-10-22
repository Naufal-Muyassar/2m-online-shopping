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

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message;
    return message ?? err.message;
  }
  return err instanceof Error ? err.message : "Terjadi kesalahan";
}
