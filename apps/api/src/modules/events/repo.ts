import type { Tx } from "../../shared/db";

export interface OutboxEvent {
  id: string;
  seq: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: unknown;
  attempts: number;
  branch_id: string;
}

export async function claimPending(tx: Tx, limit: number): Promise<OutboxEvent[]> {
  const res = await tx.query<OutboxEvent>(
    `SELECT id, seq, aggregate_type, aggregate_id, event_type, event_version, payload, attempts, branch_id
     FROM outbox_events
     WHERE status = 'PENDING' AND next_retry_at <= now()
     ORDER BY seq
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  return res.rows;
}

export async function markProcessed(tx: Tx, id: string): Promise<void> {
  await tx.query(`UPDATE outbox_events SET status = 'PROCESSED', processed_at = now() WHERE id = $1`, [id]);
}

export async function markFailedAttempt(
  tx: Tx,
  id: string,
  p: { maxAttempts: number; baseDelaySec: number; maxDelaySec: number },
): Promise<void> {
  await tx.query(
    `UPDATE outbox_events
     SET attempts = attempts + 1,
         status = CASE WHEN attempts + 1 >= $2 THEN 'FAILED'::outbox_status ELSE 'PENDING'::outbox_status END,
         next_retry_at = now() + make_interval(secs => LEAST($3::float8 * power(2::float8, attempts::float8), $4::float8))
     WHERE id = $1`,
    [id, p.maxAttempts, p.baseDelaySec, p.maxDelaySec],
  );
}
