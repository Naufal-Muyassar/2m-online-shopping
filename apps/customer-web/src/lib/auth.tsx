import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginResponse, MeResponse, RefreshResponse, RegisterRequest } from "@2m/shared";
import { api, setAccessToken, setSessionLostHandler } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await api.post<RefreshResponse>("/auth/refresh");
        setAccessToken(refreshed.data.access_token);
        const me = await api.get<MeResponse>("/auth/me");
        if (!cancelled && me.data.user.role === "customer") setUser(me.data.user);
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const accept = useCallback((res: LoginResponse) => {
    setAccessToken(res.access_token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.post<LoginResponse>("/auth/login", { identifier, password });
      if (res.data.user.role !== "customer") {
        await api.post("/auth/logout").catch(() => undefined);
        throw new Error("Akun ini bukan akun pelanggan");
      }
      accept(res.data);
    },
    [accept],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const res = await api.post<LoginResponse>("/auth/register", input);
      accept(res.data);
    },
    [accept],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
