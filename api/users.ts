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
    const col = db.collection('users');

    if (req.method === 'GET') {
      const { id, email, ids } = req.query;
      if (ids && typeof ids === 'string') {
        const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
        const validIds = idList.filter((s) => ObjectId.isValid(s));
        if (validIds.length === 0) return corsRes.status(200).json([]);
        const docs = await col.find({ _id: { $in: validIds.map((s) => new ObjectId(s)) } }).toArray();
        return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
      }
      if (id && typeof id === 'string' && ObjectId.isValid(id)) {
        const doc = await col.findOne({ _id: new ObjectId(id) });
        if (!doc) return corsRes.status(404).json({ error: 'User not found' });
        return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
      }
      if (email && typeof email === 'string') {
        const doc = await col.findOne({ email });
        if (!doc) return corsRes.status(404).json({ error: 'User not found' });
        return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
      }
      return corsRes.status(400).json({ error: 'Provide id, email, or ids' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, firstName, lastName, phone, gender, authProvider } = body;
      if (!email || !firstName || !lastName || !authProvider) {
        return corsRes.status(400).json({ error: 'Missing required fields' });
      }
      const existing = await col.findOne({ email });
      if (existing) {
        return corsRes.status(200).json(serializeDoc(existing as Record<string, unknown>));
      }
      const now = new Date().toISOString();
      const doc = {
        email,
        firstName,
        lastName,
        phone: phone || '',
        gender: gender === 'male' || gender === 'female' ? gender : undefined,
        authProvider,
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id || typeof id !== 'string' || !ObjectId.isValid(id)) {
        return corsRes.status(400).json({ error: 'Invalid user ID' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const allowed = ['firstName', 'lastName', 'displayName', 'phone', 'gender'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      // Explicitly ensure displayName is applied (client sends it; some parsers can drop it)
      if ('displayName' in body) update.displayName = body.displayName ?? '';
      // Only accept male/female for gender; ignore 'other' or invalid values
      if ('gender' in body && body.gender !== 'male' && body.gender !== 'female') {
        delete update.gender;
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }
      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'User not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
