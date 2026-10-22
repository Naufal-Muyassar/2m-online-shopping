import type { Pool } from "pg";
import type { Role } from "@2m/shared";
import type { Tx } from "../../shared/db";

export interface UserRow {
  id: string;
  role: Role;
  name: string;
  password_hash: string;
  branch_id: string | null;
  partner_id: string | null;
  is_active: boolean;
}

const USER_SELECT = `
  SELECT u.id, u.role, u.name, u.password_hash, u.branch_id, c.partner_id, u.is_active
  FROM users u LEFT JOIN couriers c ON c.user_id = u.id`;

export async function findUserByIdentifier(db: Pool, identifier: string): Promise<UserRow | null> {
  const res = await db.query<UserRow>(`${USER_SELECT} WHERE u.phone = $1 OR u.email = $1`, [identifier]);
  return res.rows[0] ?? null;
}

export async function findUserById(db: Pool | Tx, id: string): Promise<UserRow | null> {
  const res = await db.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function insertSession(
  db: Pool | Tx,
  s: { userId: string; tokenHash: string; ttlDays: number; userAgent: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [s.userId, s.tokenHash, s.ttlDays, s.userAgent],
  );
}

export async function lockActiveSession(tx: Tx, tokenHash: string): Promise<{ id: string; user_id: string } | null> {
  const res = await tx.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM sessions
     WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     FOR UPDATE`,
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function revokeSession(db: Pool | Tx, sessionId: string): Promise<void> {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}

export async function revokeByTokenHash(db: Pool, tokenHash: string): Promise<void> {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`, [
    tokenHash,
  ]);
}
