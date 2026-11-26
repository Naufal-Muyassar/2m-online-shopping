import { z } from "zod";

// Longer questions are refused with 413 AI_INPUT_TOO_LONG; same limit as contracts/ml-api.openapi.json.
export const ASSISTANT_MESSAGE_MAX = 500;

export const ASSISTANT_INTENTS = [
  "cek_pesanan",
  "tanya_ongkir",
  "tanya_produk",
  "info_umum",
  "komplain",
  "di_luar_konteks",
] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

const uuid = z.string().uuid();

// POST /assistant/ask. Send back the returned thread_id to keep the conversation's context.
export const assistantAskRequestSchema = z.object({
  // The hard cap only bounds the work done before the real length check answers AI_INPUT_TOO_LONG.
  message: z.string().trim().min(1).max(10_000),
  thread_id: uuid.optional(),
  branch_id: uuid.optional(),
});
export type AssistantAskRequest = z.infer<typeof assistantAskRequestSchema>;

export const assistantSourceSchema = z.object({ id: z.string(), title: z.string() });
export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const assistantAskResponseSchema = z.object({
  answer: z.string(),
  intent: z.enum(ASSISTANT_INTENTS),
  sources: z.array(assistantSourceSchema),
  fallback_used: z.boolean(),
  thread_id: uuid,
  remaining_today: z.number().int().min(0),
});
export type AssistantAskResponse = z.infer<typeof assistantAskResponseSchema>;

// GET /assistant/history: the caller's own answered questions, newest first. cursor is the previous next_cursor.
export const assistantHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuid.optional(),
});
export type AssistantHistoryQuery = z.infer<typeof assistantHistoryQuerySchema>;

export const assistantHistoryItemSchema = z.object({
  id: uuid,
  thread_id: uuid,
  // Personal data is masked, exactly as it was stored.
  message: z.string(),
  answer: z.string(),
  intent: z.enum(ASSISTANT_INTENTS),
  fallback_used: z.boolean(),
  created_at: z.string(),
});
export type AssistantHistoryItem = z.infer<typeof assistantHistoryItemSchema>;

export const assistantHistoryResponseSchema = z.object({
  items: z.array(assistantHistoryItemSchema),
  next_cursor: uuid.nullable(),
});
export type AssistantHistoryResponse = z.infer<typeof assistantHistoryResponseSchema>;
