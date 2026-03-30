import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  try {
    const db = await getDb();
    const col = db.collection('matches');

    if (req.method !== 'GET') {
      return corsRes.status(405).json({ error: 'Method not allowed' });
    }

    const tournamentId = typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
    if (!tournamentId) {
      return corsRes.status(400).json({ error: 'Missing tournamentId' });
    }

    const filter: Record<string, unknown> = { tournamentId };
    const stage = typeof req.query.stage === 'string' ? req.query.stage.trim() : '';
    if (stage) filter.stage = stage;
    const division = typeof req.query.division === 'string' ? req.query.division.trim() : '';
    if (division) filter.division = division;
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    if (category) filter.category = category;
    const groupIndexRaw = typeof req.query.groupIndex === 'string' ? req.query.groupIndex.trim() : '';
    if (groupIndexRaw) {
      const gi = parseInt(groupIndexRaw, 10);
      if (Number.isFinite(gi)) filter.groupIndex = gi;
    }

    const docs = await col.find(filter).sort({ createdAt: 1, _id: 1 }).toArray();
    return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
  } catch (err) {
    console.error(err);
    return withCors(res).status(500).json({ error: 'Internal server error' });
  }
}

