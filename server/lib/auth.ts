import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from './mongodb';
import { verifySessionToken } from './sessionToken';
import { getAdminEmailSet } from './adminBootstrap';

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
  if (user.role === 'admin') return true;
  const email = user.email?.toLowerCase();
  if (email && getAdminEmailSet().has(email)) return true;
  return false;
}

/**
 * Prefer Bearer session token; fall back to actingUserId in body/query (legacy clients).
 */
export function resolveActorUserId(req: VercelRequest, body?: Record<string, unknown>): string | null {
  const token = getBearerToken(req);
  if (token) {
    const v = verifySessionToken(token);
    if (v) return v.sub;
  }
  if (body && typeof body.actingUserId === 'string') return body.actingUserId;
  const q = req.query?.actingUserId;
  if (typeof q === 'string') return q;
  return null;
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
  const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
  if (!user || !isUserAdmin(user as { role?: string; email?: string })) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return { userId: auth.userId };
}
