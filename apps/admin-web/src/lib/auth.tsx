import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginResponse, MeResponse, RefreshResponse } from "@2m/shared";
import { api, setAccessToken, setSessionLostHandler } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

const ADMIN_ROLES = ["branch_admin", "super_admin"];

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
        if (!cancelled && ADMIN_ROLES.includes(me.data.user.role)) setUser(me.data.user);
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

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<LoginResponse>("/auth/login", { identifier, password });
    if (!ADMIN_ROLES.includes(res.data.user.role)) {
      await api.post("/auth/logout").catch(() => undefined);
      throw new Error("Akun ini bukan admin");
    }
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}
