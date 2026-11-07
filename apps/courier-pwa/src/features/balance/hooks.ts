import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { CourierBalance, CourierLedgerResponse } from "@2m/shared";
import { api } from "@/lib/api";

const POLL_MS = 10_000;

// Under ["courier"], so finishing a delivery refreshes these with the other courier queries.
const keys = {
  balance: ["courier", "balance"] as const,
  history: ["courier", "balance", "history"] as const,
};

export function useBalance(enabled = true) {
  return useQuery({
    queryKey: keys.balance,
    queryFn: async () => (await api.get<CourierBalance>("/courier/balance")).data,
    enabled,
    refetchInterval: POLL_MS,
  });
}

export function useBalanceHistory(enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.history,
    queryFn: async ({ pageParam }) =>
      (await api.get<CourierLedgerResponse>("/courier/balance/history", { params: { cursor: pageParam, limit: 20 } })).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
    refetchInterval: POLL_MS,
  });
}
