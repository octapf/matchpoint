import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';
import { requireAuth } from '../lib/auth';

function serializeUser(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { ...rest, _id: _id instanceof ObjectId ? _id.toString() : _id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'GET') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const auth = await requireAuth(req, corsRes);
  if (!auth) return;

  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
    if (!user) return corsRes.status(404).json({ error: 'User not found' });
    return corsRes.status(200).json(serializeUser(user as Record<string, unknown>));
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
