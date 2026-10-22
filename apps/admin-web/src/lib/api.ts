import { createApiClient } from "@2m/shared";

let accessToken: string | null = null;

export const api = createApiClient({
  platform: "admin-web",
  appVersion: "0.0.0",
  getToken: () => accessToken,
  setToken: (token) => {
    accessToken = token;
  },
});
