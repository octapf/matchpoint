import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { token, password } = body;

    if (!token || !password) {
      return corsRes.status(400).json({ error: 'Token and password are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return corsRes.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
    let payload: { userId: string; email: string };

    try {
      payload = jwt.verify(token, secret) as { userId: string; email: string };
    } catch {
      return corsRes.status(401).json({ error: 'Invalid or expired reset token' });
    }

    const db = await getDb();
    const col = db.collection('users');
    const user = await col.findOne({ _id: new ObjectId(payload.userId) });

    if (!user || user.authProvider !== 'email') {
      return corsRes.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await col.updateOne(
      { _id: user._id },
      { $set: { passwordHash, updatedAt: new Date().toISOString() } }
    );

    return corsRes.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
