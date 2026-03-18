import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { identifier, password } = body;

    if (!identifier || !password) {
      return corsRes.status(400).json({ error: 'Email/username and password are required' });
    }

    const db = await getDb();
    const col = db.collection('users');

    const lower = identifier.toLowerCase();
    const user = await col.findOne({
      $or: [{ email: lower }, { username: lower }],
      authProvider: 'email',
    });

    if (!user || !user.passwordHash) {
      return corsRes.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash as string);
    if (!valid) {
      return corsRes.status(401).json({ error: 'Invalid credentials' });
    }

    const now = new Date().toISOString();
    await col.updateOne({ _id: user._id }, { $set: { updatedAt: now } });
    const updated = await col.findOne({ _id: user._id });

    return corsRes.status(200).json(serializeDoc(updated as Record<string, unknown>));
  } catch (err) {
    console.error('Login error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
