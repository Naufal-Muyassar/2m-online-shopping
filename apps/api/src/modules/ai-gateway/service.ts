import { randomUUID } from "node:crypto";
import {
  ASSISTANT_MESSAGE_MAX,
  type AssistantAskRequest,
  type AssistantAskResponse,
  type AssistantHistoryQuery,
  type AssistantHistoryResponse,
} from "@2m/shared";
import { env } from "../../config/env";
import { withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { mlChat, mlConfigured, unavailable, type MlChatResponse } from "./client";
import { maskPii } from "./mask";
import * as repo from "./repo";

// ChatTurn.text limit in the ml-api contract.
const TURN_MAX = 1000;

export async function ask(userId: string, req: AssistantAskRequest): Promise<AssistantAskResponse> {
  if (req.message.length > ASSISTANT_MESSAGE_MAX) {
    throw new AppError(413, "AI_INPUT_TOO_LONG", "Message is too long", { max: ASSISTANT_MESSAGE_MAX });
  }
  // Checked before reserving, so a missing configuration does not use up anyone's quota.
  if (!mlConfigured()) throw unavailable();

  // Masking can lengthen a message (a short name becomes "[nama]"), hence the slice.
  const message = maskPii(req.message, await repo.knownPii(userId)).slice(0, ASSISTANT_MESSAGE_MAX);
  const threadId = req.thread_id ?? randomUUID();
  const branchId = req.branch_id ? await repo.existingBranch(req.branch_id) : null;
  const history = (await repo.recentExchanges(userId, threadId)).flatMap((e) => [
    { role: "user" as const, text: e.input_text.slice(0, TURN_MAX) },
    { role: "assistant" as const, text: e.output_text.slice(0, TURN_MAX) },
  ]);

  const slot = await withTransaction((tx) =>
    repo.reserve(
      tx,
      { userId, branchId, threadId, input: message },
      { perUser: env.ASSISTANT_DAILY_LIMIT_PER_USER, global: env.ASSISTANT_DAILY_LIMIT_GLOBAL },
    ),
  );
  if ("exceeded" in slot) {
    throw new AppError(429, "AI_BUDGET_EXCEEDED", "Daily assistant limit reached", { scope: slot.exceeded });
  }

  const started = Date.now();
  let result: MlChatResponse;
  try {
    result = await mlChat({
      message,
      ...(history.length ? { history } : {}),
      ...(branchId ? { context: { branch_id: branchId } } : {}),
    });
  } catch (err) {
    await repo.finishError(slot.id, err instanceof AppError ? err.code : "INTERNAL", Date.now() - started);
    throw err;
  }
  await repo.finishOk(slot.id, result, Date.now() - started);

  return {
    answer: result.answer,
    intent: result.intent,
    sources: result.sources,
    fallback_used: result.fallback_used,
    thread_id: threadId,
    remaining_today: slot.remaining,
  };
}

export async function history(userId: string, query: AssistantHistoryQuery): Promise<AssistantHistoryResponse> {
  const rows = await repo.history(userId, query.limit + 1, query.cursor);
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      thread_id: r.thread_id,
      message: r.input_text,
      answer: r.output_text,
      intent: r.intent,
      fallback_used: r.fallback_used,
      created_at: r.created_at.toISOString(),
    })),
    next_cursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
  };
}
