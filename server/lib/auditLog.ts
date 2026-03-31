import type { Db } from 'mongodb';
import type { VercelRequest } from '@vercel/node';
import { getClientIp } from './clientIp';

type AuditInput = {
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
  req?: VercelRequest;
};

const COLLECTION = 'admin_audit_logs';

export async function insertAuditLog(db: Db, input: AuditInput): Promise<void> {
  const now = new Date().toISOString();
  const ip = input.req ? getClientIp(input.req) : undefined;
  await db.collection(COLLECTION).insertOne({
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId,
    meta: input.meta ?? {},
    ip,
    createdAt: now,
  });
}

export async function insertAuditLogSafe(db: Db, input: AuditInput): Promise<void> {
  try {
    await insertAuditLog(db, input);
  } catch (e) {
    console.error('auditLog failed', e);
  }
}
