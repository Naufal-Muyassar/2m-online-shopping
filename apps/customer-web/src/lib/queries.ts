import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Address,
  AddressInput,
  BranchesResponse,
  Cart,
  ChatChannel,
  ChatMessage,
  ChatMessagesResponse,
  ChatOpenRequest,
  ChatSendRequest,
  ChatThread,
  ChatThreadsResponse,
  CreateOrderRequest,
  CreatedOrder,
  CustomerOrderDetail,
  MetaConfigResponse,
  OrderListResponse,
  PriceBreakdown,
  CalculatePriceRequest,
  ProductsResponse,
  TrackingResponse,
} from "@2m/shared";
import { api } from "./api";
import { TERMINAL_STATUSES } from "@2m/shared";

export const useBranches = () =>
  useQuery({ queryKey: ["branches"], queryFn: async () => (await api.get<BranchesResponse>("/branches")).data.branches });

export const useMetaConfig = () =>
  useQuery({
    queryKey: ["meta-config"],
    queryFn: async () => (await api.get<MetaConfigResponse>("/meta/config")).data,
    staleTime: Infinity,
  });

export const useProducts = (branchId: string, category: string | undefined, q: string, page: number) =>
  useQuery({
    queryKey: ["products", branchId, category, q, page],
    queryFn: async () =>
      (await api.get<ProductsResponse>(`/branches/${branchId}/products`, { params: { category, q: q || undefined, page } }))
        .data,
    placeholderData: (prev) => prev,
  });

export const useCart = (branchId: string, enabled = true) =>
  useQuery({
    queryKey: ["cart", branchId],
    queryFn: async () => (await api.get<Cart>("/cart", { params: { branch_id: branchId } })).data,
    enabled,
  });

const CHAT_ROOM_POLL_MS = 4_000;
const CHAT_LIST_POLL_MS = 15_000;

export const useChatThreads = (channel: ChatChannel) =>
  useQuery({
    queryKey: ["chat-threads", channel],
    queryFn: async () => (await api.get<ChatThreadsResponse>("/chat/threads", { params: { channel } })).data.threads,
    refetchInterval: CHAT_LIST_POLL_MS,
  });

export const useChatMessages = (threadId: string) =>
  useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: async () => (await api.get<ChatMessagesResponse>(`/chat/threads/${threadId}/messages`)).data,
    refetchInterval: CHAT_ROOM_POLL_MS,
  });

export function useOpenChat() {
  return useMutation({
    mutationFn: async (input: ChatOpenRequest) => (await api.post<ChatThread>("/chat/threads", input)).data,
  });
}

export function useChatSend(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChatSendRequest) =>
      (await api.post<ChatMessage>(`/chat/threads/${threadId}/messages`, input)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chat-messages", threadId] });
      void qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });
}

export function useChatMarkRead(threadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post(`/chat/threads/${threadId}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chat-messages", threadId] });
      void qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });
}

export const useAddresses = () =>
  useQuery({
    queryKey: ["addresses"],
    queryFn: async () => (await api.get<{ addresses: Address[] }>("/addresses")).data.addresses,
  });

export function useAddressMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["addresses"] });
  return {
    create: useMutation({
      mutationFn: async (input: AddressInput) => (await api.post<{ address: Address }>("/addresses", input)).data.address,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async (v: { id: string; input: AddressInput }) =>
        (await api.put<{ address: Address }>(`/addresses/${v.id}`, v.input)).data.address,
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await api.delete(`/addresses/${id}`);
      },
      onSuccess: invalidate,
    }),
  };
}

export const useQuote = (req: CalculatePriceRequest | null) =>
  useQuery({
    queryKey: ["quote", req],
    queryFn: async () => (await api.post<PriceBreakdown>("/calculate-price", req)).data,
    enabled: req !== null,
    retry: false,
  });

export function useCreateOrder(branchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: CreateOrderRequest) => (await api.post<{ order: CreatedOrder }>("/orders", req)).data.order,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cart", branchId] }),
  });
}

export const useOrder = (id: string, pollMs = 10_000) =>
  useQuery({
    queryKey: ["order", id],
    queryFn: async () => (await api.get<CustomerOrderDetail>(`/orders/${id}`)).data,
    refetchInterval: (query) =>
      query.state.data && TERMINAL_STATUSES.includes(query.state.data.order.status) ? false : pollMs,
  });

export const useTracking = (orderId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["tracking", orderId],
    queryFn: async () => (await api.get<TrackingResponse>(`/orders/${orderId}/tracking`)).data,
    enabled,
    // Paused while the tab is hidden (refetchIntervalInBackground defaults to false); stops once inactive.
    refetchInterval: (query) => (query.state.data && !query.state.data.active ? false : 5_000),
  });

export const useOrderHistory = () =>
  useInfiniteQuery({
    queryKey: ["orders"],
    queryFn: async ({ pageParam }) =>
      (await api.get<OrderListResponse>("/orders", { params: { cursor: pageParam, limit: 20 } })).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
