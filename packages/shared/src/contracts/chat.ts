import { z } from "zod";

export const CHAT_CHANNELS = ["customer_admin", "courier_admin", "customer_courier"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];
export const CHAT_SENDER_ROLES = ["customer", "courier", "admin"] as const;
export type ChatSenderRole = (typeof CHAT_SENDER_ROLES)[number];
export const CHAT_MESSAGE_MAX = 1000;

const uuid = z.string().uuid();

// GET /chat/threads
export const chatThreadsQuerySchema = z.object({
  channel: z.enum(CHAT_CHANNELS).optional(),
  branch_id: uuid.optional(),
});

// POST /chat/threads opens the conversation or returns the existing one. Which ids are needed depends on channel and role.
export const chatOpenRequestSchema = z.object({
  channel: z.enum(CHAT_CHANNELS),
  branch_id: uuid.optional(),
  order_id: uuid.optional(),
  courier_id: uuid.optional(),
});
export type ChatOpenRequest = z.infer<typeof chatOpenRequestSchema>;

export const chatThreadParamsSchema = z.object({ id: uuid });

export const chatThreadSchema = z.object({
  id: uuid,
  channel: z.enum(CHAT_CHANNELS),
  branch_id: uuid,
  order_id: uuid.nullable(),
  order_code: z.string().nullable(),
  // Only on courier_admin threads, where it links the thread to the courier list.
  courier_id: uuid.nullable(),
  title: z.string(),
  can_send: z.boolean(),
  unread_count: z.number().int().min(0),
  last_message: z.object({ body: z.string(), at: z.string(), mine: z.boolean() }).nullable(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;
export const chatThreadsResponseSchema = z.object({ threads: z.array(chatThreadSchema) });
export type ChatThreadsResponse = z.infer<typeof chatThreadsResponseSchema>;

export const chatMessageSchema = z.object({
  id: uuid,
  sender_role: z.enum(CHAT_SENDER_ROLES),
  sender_name: z.string(),
  body: z.string(),
  mine: z.boolean(),
  created_at: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// GET /chat/threads/:id/messages: the latest messages, oldest first
export const chatMessagesResponseSchema = z.object({ thread: chatThreadSchema, messages: z.array(chatMessageSchema) });
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

// POST /chat/threads/:id/messages: client_id makes a retried send land once
export const chatSendRequestSchema = z.object({
  body: z.string().trim().min(1).max(CHAT_MESSAGE_MAX),
  client_id: uuid,
});
export type ChatSendRequest = z.infer<typeof chatSendRequestSchema>;
