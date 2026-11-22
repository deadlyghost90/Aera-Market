import { db } from '../firebase/admin';
import { PATHS } from '../database/paths';
import { newId } from '../utils/ids';

export interface AuditInput {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, string | number | boolean | null>;
  ipHash?: string | null;
}

/**
 * Append-only audit trail. There is deliberately no update or delete helper:
 * financial actions must remain reconstructable after the fact.
 */
export async function writeAudit(input: AuditInput): Promise<string> {
  const id = newId('audit');
  await db()
    .ref(`${PATHS.auditLogs}/${id}`)
    .set({
      id,
      actorUid: input.actorUid,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta ?? {},
      ipHash: input.ipHash ?? null,
      createdAt: Date.now()
    });
  return id;
}
