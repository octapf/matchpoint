import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { getDb } from './mongodb';
import { verifySessionToken } from './sessionToken';
import { getAdminEmailSet, maybePromoteAdminOnLogin } from './adminBootstrap';

/** Returns user id from Bearer session token, or null if missing/invalid. */
export function getSessionUserId(req: VercelRequest): string | null {
  const t = getBearerToken(req);
  if (!t) return null;
  const v = verifySessionToken(t);
  return v?.sub ?? null;
}

export function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

export function isUserAdmin(user: { role?: string; email?: string }): boolean {
  if (typeof user.role === 'string' && user.role.toLowerCase() === 'admin') return true;
  const email = user.email?.toLowerCase();
  if (email && getAdminEmailSet().has(email)) return true;
  return false;
}

/**
 * Load user by id; if their email is in ADMIN_EMAILS, promote role (same as login).
 * Ensures env-based admins work even before the next sign-in.
 */
export async function loadActorUserWithAdminRefresh(
  db: Db,
  actingUserId: string
): Promise<Record<string, unknown> | null> {
  if (!ObjectId.isValid(actingUserId)) return null;
  const oid = new ObjectId(actingUserId);
  let user = await db.collection('users').findOne({ _id: oid });
  if (!user) return null;
  const email = (user as { email?: string }).email;
  if (typeof email === 'string') {
    await maybePromoteAdminOnLogin(db, email, actingUserId);
    user = await db.collection('users').findOne({ _id: oid });
  }
  return user as Record<string, unknown> | null;
}

/** Actor identity from verified Bearer session JWT only (never from client-supplied ids). */
export function resolveActorUserId(req: VercelRequest, _body?: Record<string, unknown>): string | null {
  const token = getBearerToken(req);
  if (!token) return null;
  const v = verifySessionToken(token);
  return v?.sub ?? null;
}

export function requireAuth(req: VercelRequest, res: VercelResponse): { userId: string } | null {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const v = verifySessionToken(token);
  if (!v) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return { userId: v.sub };
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ userId: string } | null> {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  const db = await getDb();
  const user = await loadActorUserWithAdminRefresh(db, auth.userId);
  if (!user || !isUserAdmin(user as { role?: string; email?: string })) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return { userId: auth.userId };
}
