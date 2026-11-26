import { z } from "zod";
import { ASSISTANT_INTENTS, assistantSourceSchema } from "@2m/shared";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors";
import { logger } from "../../shared/logger";

// Mirrors POST /v1/chat in contracts/ml-api.openapi.json.
export interface MlChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; text: string }[];
  context?: { branch_id: string };
}

const chatResponseSchema = z.object({
  answer: z.string().min(1),
  intent: z.enum(ASSISTANT_INTENTS),
  sources: z.array(assistantSourceSchema),
  fallback_used: z.boolean(),
  usage: z.object({
    model: z.string(),
    prompt_version: z.string(),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    latency_ms: z.number().int().min(0),
    cached: z.boolean(),
  }),
});
export type MlChatResponse = z.infer<typeof chatResponseSchema>;

const RETRY_DELAY_MS = 200;

export const unavailable = () => new AppError(503, "AI_UNAVAILABLE", "Assistant is unavailable");
const timedOut = () => new AppError(504, "AI_TIMEOUT", "Assistant took too long");

export const mlConfigured = () => Boolean(env.ML_API_URL && env.ML_API_KEY);

function errorForStatus(status: number): AppError {
  if (status === 413) return new AppError(413, "AI_INPUT_TOO_LONG", "Message is too long");
  if (status === 429) return new AppError(429, "AI_BUDGET_EXCEEDED", "Assistant budget used up", { scope: "service" });
  if (status === 504) return timedOut();
  return unavailable();
}

// One retry, only for network errors and 5xx. A timeout is not retried: it would double the wait and the LLM cost.
export async function mlChat(body: MlChatRequest): Promise<MlChatResponse> {
  const url = new URL("/v1/chat", env.ML_API_URL);
  for (let attempt = 1; ; attempt++) {
    const last = attempt === 2;
    let status: number;
    let payload: unknown;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": env.ML_API_KEY! },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.ML_API_TIMEOUT_MS),
      });
      status = res.status;
      payload = res.ok ? await res.json() : await res.text();
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") throw timedOut();
      logger.warn({ attempt, reason: err instanceof Error ? err.message : "unknown" }, "ml-api call failed");
      if (last) throw unavailable();
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      continue;
    }
    if (status === 200) {
      const parsed = chatResponseSchema.safeParse(payload);
      if (parsed.success) return parsed.data;
      logger.error("ml-api answered outside the contract");
      throw unavailable();
    }
    logger.warn({ attempt, status }, "ml-api returned an error");
    if (status < 500 || last) throw errorForStatus(status);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}
