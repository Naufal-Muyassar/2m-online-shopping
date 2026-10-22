import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

export interface ApiClientOptions {
  baseURL?: string;
  platform: string;
  appVersion: string;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export function createApiClient(opts: ApiClientOptions): AxiosInstance {
  const client = axios.create({ baseURL: opts.baseURL ?? "/api/v1", withCredentials: true });
  let refreshing: Promise<string> | null = null;

  const refresh = async (): Promise<string> => {
    const res = await axios.post<{ access_token: string }>(
      `${client.defaults.baseURL}/auth/refresh`,
      undefined,
      { withCredentials: true },
    );
    return res.data.access_token;
  };

  client.interceptors.request.use((config) => {
    config.headers.set("X-App-Version", opts.appVersion);
    config.headers.set("X-Platform", opts.platform);
    const token = opts.getToken();
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const isRefreshCall = config?.url?.endsWith("/auth/refresh");
    if (error.response?.status !== 401 || !config || config._retried || isRefreshCall) throw error;
    config._retried = true;
    try {
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      opts.setToken(await refreshing);
    } catch {
      opts.setToken(null);
      throw error;
    }
    return client.request(config);
  });

  return client;
}
