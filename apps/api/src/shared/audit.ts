import type { Tx } from "./db";

export interface AuditInput {
  actorId: string | null;
  actorRole: string;
  branchId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function audit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.query(
    `INSERT INTO audit_logs (actor_id, actor_role, branch_id, action, entity_type, entity_id, before, after, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.actorId,
      input.actorRole,
      input.branchId,
      input.action,
      input.entityType,
      input.entityId,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.ip ?? null,
    ],
  );
}
