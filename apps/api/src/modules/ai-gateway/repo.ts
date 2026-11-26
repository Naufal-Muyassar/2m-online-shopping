import type { AssistantIntent } from "@2m/shared";
import { pool, type Tx } from "../../shared/db";
import type { MlChatResponse } from "./client";
import type { KnownPii } from "./mask";

// The caps are per calendar day in Indonesia.
const TODAY = `(date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')`;

export async function knownPii(userId: string): Promise<KnownPii> {
  const user = await pool.query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [userId]);
  const addresses = await pool.query<{ street: string | null; unit: string | null; receiver_name: string | null }>(
    `SELECT street, unit, receiver_name FROM addresses WHERE user_id = $1`,
    [userId],
  );
  const present = (v: string | null | undefined): v is string => Boolean(v);
  return {
    names: [user.rows[0]?.name, ...addresses.rows.map((a) => a.receiver_name)].filter(present),
    addresses: addresses.rows.flatMap((a) => [a.street, a.unit]).filter(present),
  };
}

export async function existingBranch(branchId: string): Promise<string | null> {
  const res = await pool.query(`SELECT 1 FROM branches WHERE id = $1`, [branchId]);
  return res.rowCount ? branchId : null;
}

// The last three answered exchanges of this user's thread, oldest first.
export async function recentExchanges(userId: string, threadId: string) {
  const res = await pool.query<{ input_text: string; output_text: string }>(
    `SELECT input_text, output_text FROM (
       SELECT input_text, output_text, created_at FROM llm_usage
        WHERE user_id = $1 AND thread_id = $2 AND status = 'ok'
        ORDER BY created_at DESC LIMIT 3
     ) t ORDER BY created_at`,
    [userId, threadId],
  );
  return res.rows;
}

export interface UsageStart {
  userId: string;
  branchId: string | null;
  threadId: string;
  input: string;
}

export interface Limits {
  perUser: number;
  global: number;
}

export type Reservation = { id: string; remaining: number } | { exceeded: "user" | "global" };

async function insert(tx: Tx, s: UsageStart, status: "pending" | "budget", errorCode: string | null): Promise<string> {
  const res = await tx.query<{ id: string }>(
    `INSERT INTO llm_usage (user_id, branch_id, thread_id, channel, feature, input_text, status, error_code)
     VALUES ($1, $2, $3, 'app', 'chat', $4, $5, $6) RETURNING id`,
    [s.userId, s.branchId, s.threadId, s.input, status, errorCode],
  );
  return res.rows[0]!.id;
}

// Counts and inserts under one lock, so parallel requests cannot both take the last slot. Every attempt counts,
// failed ones included, because a failed call may already have spent tokens.
export async function reserve(tx: Tx, start: UsageStart, limits: Limits): Promise<Reservation> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext('llm_usage_quota'))`);
  const count = await tx.query<{ mine: number; total: number }>(
    `SELECT count(*) FILTER (WHERE user_id = $1)::int AS mine, count(*)::int AS total
       FROM llm_usage WHERE created_at >= ${TODAY} AND status <> 'budget'`,
    [start.userId],
  );
  const { mine, total } = count.rows[0]!;
  const exceeded = mine >= limits.perUser ? "user" : total >= limits.global ? "global" : null;
  if (exceeded) {
    // One refusal row per user per day is enough to see it happened; repeats must not grow the table.
    const seen = await tx.query(
      `SELECT 1 FROM llm_usage WHERE user_id = $1 AND status = 'budget' AND created_at >= ${TODAY} LIMIT 1`,
      [start.userId],
    );
    if (!seen.rowCount) await insert(tx, start, "budget", "AI_BUDGET_EXCEEDED");
    return { exceeded };
  }
  const id = await insert(tx, start, "pending", null);
  return { id, remaining: Math.min(limits.perUser - mine, limits.global - total) - 1 };
}

export async function finishOk(id: string, r: MlChatResponse, latencyMs: number): Promise<void> {
  await pool.query(
    `UPDATE llm_usage SET status = 'ok', intent = $2, output_text = $3, model = $4, prompt_version = $5,
       input_tokens = $6, output_tokens = $7, latency_ms = $8, cached = $9, fallback_used = $10
     WHERE id = $1`,
    [
      id,
      r.intent,
      r.answer,
      r.usage.model,
      r.usage.prompt_version,
      r.usage.input_tokens,
      r.usage.output_tokens,
      latencyMs,
      r.usage.cached,
      r.fallback_used,
    ],
  );
}

export async function finishError(id: string, errorCode: string, latencyMs: number): Promise<void> {
  await pool.query(`UPDATE llm_usage SET status = 'error', error_code = $2, latency_ms = $3 WHERE id = $1`, [
    id,
    errorCode,
    latencyMs,
  ]);
}

export interface HistoryRow {
  id: string;
  thread_id: string;
  input_text: string;
  output_text: string;
  intent: AssistantIntent;
  fallback_used: boolean;
  created_at: Date;
}

export async function history(userId: string, limit: number, cursor?: string): Promise<HistoryRow[]> {
  const res = await pool.query<HistoryRow>(
    `SELECT id, thread_id, input_text, output_text, intent, fallback_used, created_at
       FROM llm_usage
      WHERE user_id = $1 AND status = 'ok'
        AND ($3::uuid IS NULL
             OR (created_at, id) < (SELECT c.created_at, c.id FROM llm_usage c WHERE c.id = $3 AND c.user_id = $1))
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, limit, cursor ?? null],
  );
  return res.rows;
}
