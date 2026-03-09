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
    const col = db.collection('tournaments');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { status, organizerId, inviteLink } = req.query;
      if (status && typeof status === 'string') filter.status = status;
      if (organizerId && typeof organizerId === 'string') filter.organizerIds = { $in: [organizerId] };
      if (inviteLink && typeof inviteLink === 'string') filter.inviteLink = inviteLink;

      const docs = await col.find(filter).sort({ date: 1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, date, location, description, maxTeams, inviteLink, organizerIds } = body;
      if (!name || !date || !location || !maxTeams || !inviteLink || !organizerIds?.length) {
        return corsRes.status(400).json({ error: 'Missing required fields' });
      }
      const now = new Date().toISOString();
      const doc = {
        name,
        date,
        location,
        description: description || '',
        maxTeams: Number(maxTeams),
        inviteLink,
        status: 'open',
        organizerIds: Array.isArray(organizerIds) ? organizerIds : [organizerIds],
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
