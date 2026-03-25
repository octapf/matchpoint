import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';
import { requireAdmin } from '../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'GET') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const admin = await requireAdmin(req, corsRes);
  if (!admin) return;

  try {
    const db = await getDb();
    const [users, tournaments, entries, teams] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('tournaments').countDocuments(),
      db.collection('entries').countDocuments(),
      db.collection('teams').countDocuments(),
    ]);
    return corsRes.status(200).json({ users, tournaments, entries, teams });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
