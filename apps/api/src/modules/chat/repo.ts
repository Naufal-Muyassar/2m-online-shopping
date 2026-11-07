import type { Pool } from "pg";
import type { ChatChannel, ChatSenderRole, OrderStatus } from "@2m/shared";

export interface ThreadRow {
  id: string;
  channel: ChatChannel;
  branch_id: string;
  customer_id: string | null;
  courier_id: string | null;
  order_id: string | null;
  branch_name: string;
  customer_name: string | null;
  courier_name: string | null;
  receiver_name: string | null;
  order_code: string | null;
  order_status: OrderStatus | null;
  assigned_courier_id: string | null;
  last_body: string | null;
  last_at: Date | null;
  last_sender_role: ChatSenderRole | null;
  unread_count: number;
}

const READ_COLUMN: Record<ChatSenderRole, string> = {
  customer: "customer_read_at",
  courier: "courier_read_at",
  admin: "admin_read_at",
};

const threadSelect = (role: ChatSenderRole) => `
  SELECT t.id, t.channel, t.branch_id, t.customer_id, t.courier_id, t.order_id,
         b.name AS branch_name, cu.name AS customer_name, co.name AS courier_name, a.receiver_name,
         o.code AS order_code, o.status AS order_status, o.assigned_courier_id,
         lm.body AS last_body, lm.created_at AS last_at, lm.sender_role AS last_sender_role,
         (SELECT count(*)::int FROM chat_messages m
          WHERE m.thread_id = t.id AND m.sender_role <> '${role}'
            AND m.created_at > COALESCE(t.${READ_COLUMN[role]}, '-infinity')) AS unread_count
  FROM chat_threads t
  JOIN branches b ON b.id = t.branch_id
  LEFT JOIN users cu ON cu.id = t.customer_id
  LEFT JOIN users co ON co.id = t.courier_id
  LEFT JOIN orders o ON o.id = t.order_id
  LEFT JOIN addresses a ON a.id = o.address_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_role FROM chat_messages m
    WHERE m.thread_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true`;

export async function getThread(db: Pool, id: string, role: ChatSenderRole): Promise<ThreadRow | null> {
  const res = await db.query<ThreadRow>(`${threadSelect(role)} WHERE t.id = $1`, [id]);
  return res.rows[0] ?? null;
}

// A customer-courier thread follows the order: a courier released from it no longer sees it.
const STILL_ASSIGNED = `(t.channel <> 'customer_courier' OR o.assigned_courier_id = t.courier_id)`;

export async function listThreads(
  db: Pool,
  viewer: { role: ChatSenderRole; userId: string; branchId: string | null },
  channel?: ChatChannel,
): Promise<ThreadRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (viewer.role === "admin") {
    params.push(viewer.branchId);
    where.push(`t.branch_id = $${params.length}`, `t.channel <> 'customer_courier'`, `t.last_message_at IS NOT NULL`);
  } else {
    params.push(viewer.userId);
    where.push(`t.${viewer.role === "customer" ? "customer_id" : "courier_id"} = $${params.length}`, STILL_ASSIGNED);
  }
  if (channel) {
    params.push(channel);
    where.push(`t.channel = $${params.length}::chat_channel`);
  }
  const res = await db.query<ThreadRow>(
    `${threadSelect(viewer.role)} WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT 100`,
    params,
  );
  return res.rows;
}

export async function openThread(
  db: Pool,
  t: { channel: ChatChannel; branchId: string; customerId?: string; courierId?: string; orderId?: string },
): Promise<string> {
  const values = [t.channel, t.branchId, t.customerId ?? null, t.courierId ?? null, t.orderId ?? null];
  await db.query(
    `INSERT INTO chat_threads (channel, branch_id, customer_id, courier_id, order_id)
     VALUES ($1::chat_channel, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    values,
  );
  const res = await db.query<{ id: string }>(
    `SELECT id FROM chat_threads
     WHERE channel = $1::chat_channel AND branch_id = $2
       AND customer_id IS NOT DISTINCT FROM $3::uuid
       AND courier_id IS NOT DISTINCT FROM $4::uuid
       AND order_id IS NOT DISTINCT FROM $5::uuid`,
    values,
  );
  return res.rows[0]!.id;
}

export interface MessageRow {
  id: string;
  sender_role: ChatSenderRole;
  sender_name: string;
  body: string;
  created_at: Date;
}

export async function listMessages(db: Pool, threadId: string, limit: number): Promise<MessageRow[]> {
  const res = await db.query<MessageRow>(
    `SELECT m.id, m.sender_role, u.name AS sender_name, m.body, m.created_at
     FROM chat_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.thread_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT $2`,
    [threadId, limit],
  );
  return res.rows.reverse();
}

export async function insertMessage(
  db: Pool,
  m: { threadId: string; senderId: string; role: ChatSenderRole; body: string; clientId: string },
): Promise<MessageRow> {
  await db.query(
    `WITH sent AS (
       INSERT INTO chat_messages (thread_id, sender_id, sender_role, body, client_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (thread_id, client_id) DO NOTHING
       RETURNING thread_id, created_at
     )
     UPDATE chat_threads t SET last_message_at = sent.created_at, ${READ_COLUMN[m.role]} = sent.created_at
     FROM sent WHERE t.id = sent.thread_id`,
    [m.threadId, m.senderId, m.role, m.body, m.clientId],
  );
  const res = await db.query<MessageRow>(
    `SELECT m.id, m.sender_role, u.name AS sender_name, m.body, m.created_at
     FROM chat_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.thread_id = $1 AND m.client_id = $2`,
    [m.threadId, m.clientId],
  );
  return res.rows[0]!;
}

export async function markRead(db: Pool, threadId: string, role: ChatSenderRole): Promise<void> {
  await db.query(`UPDATE chat_threads SET ${READ_COLUMN[role]} = now() WHERE id = $1`, [threadId]);
}

export async function branchExists(db: Pool, id: string): Promise<boolean> {
  return ((await db.query(`SELECT 1 FROM branches WHERE id = $1`, [id])).rowCount ?? 0) > 0;
}

export async function findOrder(db: Pool, id: string) {
  const res = await db.query<{ branch_id: string; customer_id: string; assigned_courier_id: string | null }>(
    `SELECT branch_id, customer_id, assigned_courier_id FROM orders WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function findCourierBranch(db: Pool, courierId: string): Promise<string | null> {
  const res = await db.query<{ branch_id: string }>(`SELECT branch_id FROM couriers WHERE user_id = $1`, [courierId]);
  return res.rows[0]?.branch_id ?? null;
}
