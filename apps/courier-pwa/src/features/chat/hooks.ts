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
import { api } from "@/lib/api";

const ROOM_POLL_MS = 4_000;
const LIST_POLL_MS = 15_000;

export function useChatThreads(channel: ChatChannel, enabled = true) {
  return useQuery({
    queryKey: ["chat-threads", channel],
    queryFn: async () => (await api.get<ChatThreadsResponse>("/chat/threads", { params: { channel } })).data.threads,
    enabled,
    refetchInterval: LIST_POLL_MS,
  });
}

export function useChatMessages(threadId: string) {
  return useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: async () => (await api.get<ChatMessagesResponse>(`/chat/threads/${threadId}/messages`)).data,
    refetchInterval: ROOM_POLL_MS,
  });
}

export const openChat = async (input: ChatOpenRequest) => (await api.post<ChatThread>("/chat/threads", input)).data;

// The courier has one conversation with the branch; opening it is safe to repeat.
export function useAdminThread() {
  return useQuery({
    queryKey: ["chat-admin-thread"],
    queryFn: () => openChat({ channel: "courier_admin" }),
    staleTime: Infinity,
  });
}

export function useOpenChat() {
  return useMutation({ mutationFn: openChat });
}

export function useChatSend(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChatSendRequest) =>
      (await api.post<ChatMessage>(`/chat/threads/${threadId}/messages`, input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-messages", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });
}

export function useChatMarkRead(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post(`/chat/threads/${threadId}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-messages", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
  });
}
