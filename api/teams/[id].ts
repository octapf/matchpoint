import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  const id = req.query.id as string;
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('teams');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const allowed = ['name', 'playerIds'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }
      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const result = await col.deleteOne({ _id: oid });
      if (result.deletedCount === 0) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
