import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, LoginResponse, MeResponse, RefreshResponse } from "@2m/shared";
import { api, setAccessToken, setSessionLostHandler } from "@/lib/api";

interface SessionValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setSessionLostHandler(null);
  }, [queryClient]);

  // Silent restore: the refresh cookie yields a fresh in-memory access token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await api.post<RefreshResponse>("/auth/refresh");
        setAccessToken(refreshed.data.access_token);
        const me = await api.get<MeResponse>("/auth/me");
        if (!cancelled && me.data.user.role === "courier") setUser(me.data.user);
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<LoginResponse>("/auth/login", { identifier, password });
    if (res.data.user.role !== "courier") {
      setAccessToken(null);
      throw new Error("Akun ini bukan akun kurir.");
    }
    setAccessToken(res.data.access_token);
    queryClient.removeQueries({ queryKey: ["courier"] });
    setUser(res.data.user);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}