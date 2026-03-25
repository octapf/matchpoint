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
    const col = db.collection('entries');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, userId, teamId } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (userId && typeof userId === 'string') filter.userId = userId;
      if (teamId && typeof teamId === 'string') filter.teamId = teamId;

      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { tournamentId, userId, lookingForPartner } = body;
      if (!tournamentId || !userId) {
        return corsRes.status(400).json({ error: 'Missing tournamentId or userId' });
      }
      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        userId,
        teamId: null,
        lookingForPartner: !!lookingForPartner,
        status: 'joined',
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
