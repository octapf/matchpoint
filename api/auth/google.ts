import type { VercelRequest, VercelResponse } from '@vercel/node';
import { OAuth2Client } from 'google-auth-library';
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
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const webClientId = process.env.GOOGLE_CLIENT_ID;
  const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
  const audiences = [webClientId, androidClientId].filter(Boolean);
  if (audiences.length === 0) {
    return corsRes.status(500).json({ error: 'Google auth not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { idToken } = body;
    if (!idToken || typeof idToken !== 'string') {
      return corsRes.status(400).json({ error: 'Missing idToken' });
    }

    const client = new OAuth2Client(webClientId || androidClientId);
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return corsRes.status(400).json({ error: 'Invalid token' });
    }

    const email = payload.email;
    const firstName = payload.given_name || payload.name?.split(' ')[0] || '';
    const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '';
    // Google OAuth does not provide gender in standard claims; default to 'other'
    const gender = payload.gender === 'male' || payload.gender === 'female' ? payload.gender : 'other';

    const db = await getDb();
    const col = db.collection('users');
    let user = await col.findOne({ email });

    const now = new Date().toISOString();
    if (user) {
      await col.updateOne(
        { _id: user._id },
        { $set: { updatedAt: now, authProvider: 'google', firstName, lastName, gender: user.gender || gender } }
      );
      user = await col.findOne({ _id: user._id });
    } else {
      const result = await col.insertOne({
        email,
        firstName,
        lastName,
        phone: '',
        gender,
        authProvider: 'google',
        createdAt: now,
        updatedAt: now,
      });
      user = await col.findOne({ _id: result.insertedId });
    }

    return corsRes.status(200).json(serializeDoc(user as Record<string, unknown>));
  } catch (err) {
    console.error('Google auth error:', err);
    return corsRes.status(401).json({ error: 'Authentication failed' });
  }
}
