import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../server/lib/cors';
import { getDeploymentRevision, isMongoConfigured } from '../server/lib/env';
import { getDb } from '../server/lib/mongodb';

/**
 * Liveness/readiness: MongoDB ping. No auth.
 * GET /api/health
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).status(204).end();
  if (req.method !== 'GET') return withCors(req, res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(req, res);
  const revision = getDeploymentRevision();

  if (!isMongoConfigured()) {
    return corsRes.status(503).json({
      ok: false,
      db: false,
      error: 'Database not configured',
      revision,
    });
  }

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return corsRes.status(200).json({
      ok: true,
      db: true,
      revision,
    });
  } catch (e) {
    return corsRes.status(503).json({
      ok: false,
      db: false,
      error: 'Database unreachable',
      revision,
    });
  }
}
