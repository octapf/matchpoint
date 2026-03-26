/**
 * Single admin handler for Vercel Hobby (max 12 serverless functions per deployment).
 * GET /api/admin?type=stats|tournaments|users|devSeedInfo
 * POST /api/admin — body: { action: 'devSeed', force?: boolean } | { action: 'devSeedPurge' }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { requireAdmin } from '../server/lib/auth';
import { getDevSeedInfo, purgeDevSeed, runDevSeed } from '../server/lib/seedDevTournament';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, _id: _id instanceof ObjectId ? _id.toString() : _id };
}

/** Vercel may pass `req.query.type` as string or string[] */
function queryString(q: unknown): string {
  if (typeof q === 'string') return q;
  if (Array.isArray(q) && typeof q[0] === 'string') return q[0];
  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, corsRes);
    if (!admin) return;
    const raw = req.body;
    const body = (typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}) as Record<string, unknown>;
    try {
      const db = await getDb();
      if (body.action === 'devSeedPurge') {
        const result = await purgeDevSeed(db);
        return corsRes.status(200).json(result);
      }
      if (body.action !== 'devSeed') {
        return corsRes.status(400).json({ error: 'Invalid action (devSeed | devSeedPurge)' });
      }
      const result = await runDevSeed(db, { force: !!body.force });
      return corsRes.status(200).json(result);
    } catch (err) {
      console.error(err);
      return corsRes.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method !== 'GET') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, corsRes);
  if (!admin) return;

  const type = queryString(req.query.type);

  try {
    const db = await getDb();

    if (type === 'stats') {
      const [users, tournaments, entries, teams] = await Promise.all([
        db.collection('users').countDocuments(),
        db.collection('tournaments').countDocuments(),
        db.collection('entries').countDocuments(),
        db.collection('teams').countDocuments(),
      ]);
      return corsRes.status(200).json({ users, tournaments, entries, teams });
    }

    if (type === 'tournaments') {
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
      const docs = await db
        .collection('tournaments')
        .find({})
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (type === 'users') {
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
      const docs = await db
        .collection('users')
        .find(
          {},
          {
            projection: { passwordHash: 0 },
          }
        )
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (type === 'devSeedInfo') {
      const info = await getDevSeedInfo(db);
      return corsRes.status(200).json(info);
    }

    return corsRes.status(400).json({ error: 'Invalid or missing type (stats|tournaments|users|devSeedInfo)' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
