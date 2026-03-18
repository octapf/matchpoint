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
    const { email, username, password, firstName, lastName } = body;

    if (!email || !username || !password || !firstName || !lastName) {
      return corsRes.status(400).json({ error: 'All fields are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return corsRes.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = await getDb();
    const col = db.collection('users');

    const existingEmail = await col.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return corsRes.status(409).json({ error: 'Email already in use' });
    }

    const existingUsername = await col.findOne({ username: username.toLowerCase() });
    if (existingUsername) {
      return corsRes.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    const result = await col.insertOne({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
      authProvider: 'email',
      phone: '',
      createdAt: now,
      updatedAt: now,
    });

    const user = await col.findOne({ _id: result.insertedId });
    return corsRes.status(201).json(serializeDoc(user as Record<string, unknown>));
  } catch (err) {
    console.error('Signup error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
