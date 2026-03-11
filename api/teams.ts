import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from './lib/mongodb';
import { withCors } from './lib/cors';

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
    const col = db.collection('teams');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, createdBy } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (createdBy && typeof createdBy === 'string') filter.createdBy = createdBy;

      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { tournamentId, name, playerIds, createdBy } = body;
      if (!tournamentId || !name || !playerIds?.length || !createdBy) {
        return corsRes.status(400).json({ error: 'Missing required fields' });
      }
      const playerIdSet = new Set(Array.isArray(playerIds) ? playerIds : [playerIds]);
      const existing = await col.findOne({
        tournamentId,
        playerIds: { $in: Array.from(playerIdSet) },
      });
      if (existing) {
        return corsRes.status(400).json({ error: 'You can only be in one team per tournament' });
      }
      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        name,
        playerIds: Array.isArray(playerIds) ? playerIds : [playerIds],
        createdBy,
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
