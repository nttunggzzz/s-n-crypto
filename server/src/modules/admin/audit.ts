import type { AuditAction, AuditTargetType } from '@cex/contracts';
import { auditLogs } from '../../db/schema.ts';
import type { DbOrTx } from '../../db/client.ts';

export interface AuditInput {
  /** null = server command line. */
  actorId: string | null;
  action: AuditAction;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
}

/**
 * Appends one audit row inside the caller's transaction (so it exists iff the change commits).
 * The table is append-only at the database level.
 */
export async function writeAudit(tx: DbOrTx, e: AuditInput): Promise<number> {
  const [row] = await tx
    .insert(auditLogs)
    .values({
      actorId: e.actorId,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      reason: e.reason ?? null,
      ip: e.ip ?? null,
    })
    .returning({ id: auditLogs.id });
  return row!.id;
}
