import type { VercelRequest, VercelResponse } from '@vercel/node';
import verifyAppleToken from 'verify-apple-id-token';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { issueSessionAndUser } from '../../server/lib/authResponse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return corsRes.status(500).json({ error: 'Apple auth not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { identityToken, firstName: givenFirstName, lastName: givenLastName } = body;
    if (!identityToken || typeof identityToken !== 'string') {
      return corsRes.status(400).json({ error: 'Missing identityToken' });
    }

    const jwtClaims = await verifyAppleToken({
      idToken: identityToken,
      clientId,
    });

    const email = jwtClaims.email;
    if (!email) {
      return corsRes.status(400).json({ error: 'Email not provided by Apple' });
    }

    const db = await getDb();
    const col = db.collection('users');
    let user = await col.findOne({ email });

    const now = new Date().toISOString();
    if (user) {
      const update: Record<string, unknown> = { updatedAt: now, authProvider: 'apple' };
      if (givenFirstName && !user.firstName) update.firstName = givenFirstName;
      if (givenLastName && !user.lastName) update.lastName = givenLastName;
      await col.updateOne({ _id: user._id }, { $set: update });
      user = await col.findOne({ _id: user._id });
    } else {
      const firstName = givenFirstName || '';
      const lastName = givenLastName || '';
      const result = await col.insertOne({
        email,
        firstName,
        lastName,
        phone: '',
        authProvider: 'apple',
        createdAt: now,
        updatedAt: now,
      });
      user = await col.findOne({ _id: result.insertedId });
    }

    const { user: u, accessToken } = await issueSessionAndUser(db, String(user!._id), email);
    return corsRes.status(200).json({ ...u, accessToken });
  } catch (err) {
    console.error('Apple auth error:', err);
    return corsRes.status(401).json({ error: 'Authentication failed' });
  }
}
