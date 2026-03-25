import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';
import { requireAdmin } from '../lib/auth';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id instanceof ObjectId ? _id.toString() : _id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'GET') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const admin = await requireAdmin(req, corsRes);
  if (!admin) return;

  try {
    const db = await getDb();
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const docs = await db
      .collection('tournaments')
      .find({})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
