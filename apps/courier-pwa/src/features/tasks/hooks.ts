import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CourierMe,
  CourierOrder,
  CourierOrderStatusRequest,
  CourierOrdersResponse,
  CourierStatusRequest,
  CourierStatusResponse,
} from "@2m/shared";
import axios from "axios";
import { api } from "@/lib/api";

const POLL_MS = 10_000;

// Max 2 retries, only for network failures / 5xx (never for 4xx validation or state errors).
const retryTwice = (count: number, err: unknown) =>
  count < 2 && !(axios.isAxiosError(err) && err.response !== undefined && err.response.status < 500);

export const keys = {
  me: ["courier", "me"] as const,
  orders: ["courier", "orders"] as const,
  order: (id: string) => ["courier", "orders", id] as const,
};

export function useMe(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => (await api.get<CourierMe>("/courier/me")).data,
    enabled,
    refetchInterval: POLL_MS,
  });
}

// refetchIntervalInBackground defaults to false, so polling pauses while the tab is hidden.
export function useOrders(enabled = true) {
  return useQuery({
    queryKey: keys.orders,
    queryFn: async () => (await api.get<CourierOrdersResponse>("/courier/orders")).data,
    enabled,
    refetchInterval: POLL_MS,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: keys.order(id),
    queryFn: async () => (await api.get<CourierOrder>(`/courier/orders/${id}`)).data,
    refetchInterval: POLL_MS,
  });
}

export function useSetCourierStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: CourierStatusRequest["status"]) =>
      (await api.put<CourierStatusResponse>("/courier/status", { status })).data,
    retry: retryTwice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courier"] }),
  });
}

export interface OrderStatusVars {
  orderId: string;
  body: CourierOrderStatusRequest;
}

// The idempotency_key lives in the variables, so mutation retries reuse it.
export function useOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, body }: OrderStatusVars) =>
      (await api.post(`/courier/orders/${orderId}/status`, body)).data,
    retry: retryTwice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courier"] }),
  });
}
