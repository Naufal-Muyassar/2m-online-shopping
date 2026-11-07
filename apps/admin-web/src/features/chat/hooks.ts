import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatChannel,
  ChatMessage,
  ChatMessagesResponse,
  ChatOpenRequest,
  ChatSendRequest,
  ChatThread,
  ChatThreadsResponse,
} from "@2m/shared";
import { api } from "../../lib/api";
import { useBranch } from "../branch-config/BranchProvider";

const ROOM_POLL_MS = 4_000;
const LIST_POLL_MS = 10_000;

export function useChatThreads(channel: ChatChannel) {
  const { branchId } = useBranch();
  return useQuery({
    queryKey: ["chat-threads", branchId, channel],
    enabled: !!branchId,
    refetchInterval: LIST_POLL_MS,
    queryFn: async () =>
      (await api.get<ChatThreadsResponse>("/chat/threads", { params: { channel, branch_id: branchId } })).data.threads,
  });
}

export function useUnreadChats(): Record<"customer_admin" | "courier_admin", number> {
  const sum = (threads?: ChatThread[]) => threads?.reduce((n, t) => n + t.unread_count, 0) ?? 0;
  return {
    customer_admin: sum(useChatThreads("customer_admin").data),
    courier_admin: sum(useChatThreads("courier_admin").data),
  };
}

export function useChatMessages(threadId: string) {
  return useQuery({
    queryKey: ["chat-messages", threadId],
    refetchInterval: ROOM_POLL_MS,
    queryFn: async () => (await api.get<ChatMessagesResponse>(`/chat/threads/${threadId}/messages`)).data,
  });
}

export const openChat = async (input: ChatOpenRequest) => (await api.post<ChatThread>("/chat/threads", input)).data;

// Opening is safe to repeat, so a panel can resolve its thread as a query.
export function useOpenedThread(input: ChatOpenRequest) {
  return useQuery({
    queryKey: ["chat-open", input.channel, input.order_id, input.courier_id],
    queryFn: () => openChat(input),
    staleTime: Infinity,
  });
}

function useRefreshChat(threadId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["chat-messages", threadId] });
    void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
  };
}

export function useChatSend(threadId: string) {
  const refresh = useRefreshChat(threadId);
  return useMutation({
    mutationFn: async (input: ChatSendRequest) =>
      (await api.post<ChatMessage>(`/chat/threads/${threadId}/messages`, input)).data,
    onSuccess: refresh,
  });
}

export function useChatMarkRead(threadId: string) {
  const refresh = useRefreshChat(threadId);
  return useMutation({
    mutationFn: async () => api.post(`/chat/threads/${threadId}/read`),
    onSuccess: refresh,
  });
}
