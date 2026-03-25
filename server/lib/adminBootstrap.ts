import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

/** Comma-separated list in Vercel env; matched case-insensitively on login. */
export function getAdminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export async function maybePromoteAdminOnLogin(
  db: Db,
  email: string | undefined,
  userId: string
): Promise<void> {
  if (!email) return;
  const e = email.toLowerCase();
  if (!getAdminEmailSet().has(e)) return;
  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { role: 'admin', updatedAt: new Date().toISOString() } }
  );
}
