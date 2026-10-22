import type { Tx } from "../../shared/db";

// FIFO per branch: the courier who has been IDLE the longest. SKIP LOCKED keeps concurrent assignments apart.
export async function pickIdleCourier(tx: Tx, branchId: string): Promise<string | null> {
  const res = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM couriers
     WHERE branch_id = $1 AND status = 'IDLE'
     ORDER BY last_status_change ASC
     LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [branchId],
  );
  return res.rows[0]?.user_id ?? null;
}

export async function lockIdleCourier(tx: Tx, courierId: string, branchId: string): Promise<boolean> {
  const res = await tx.query(
    `SELECT 1 FROM couriers WHERE user_id = $1 AND branch_id = $2 AND status = 'IDLE' FOR UPDATE`,
    [courierId, branchId],
  );
  return res.rowCount === 1;
}

export async function lockOldestReadyOrder(tx: Tx, branchId: string): Promise<string | null> {
  const res = await tx.query<{ id: string }>(
    `SELECT id FROM orders
     WHERE branch_id = $1 AND status = 'READY'
     ORDER BY ready_at ASC
     LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [branchId],
  );
  return res.rows[0]?.id ?? null;
}
