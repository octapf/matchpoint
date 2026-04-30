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
import { runDbBackfill } from '../server/lib/dbBackfill';
import { ensureDbIndexes } from '../server/lib/dbIndexes';
import { adminPostSchema } from '../server/lib/schemas/adminPost';
import { insertAuditLogSafe } from '../server/lib/auditLog';
import { captureException } from '../server/lib/observability';
import { getDeploymentRevision, isMongoConfigured } from '../server/lib/env';

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
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, corsRes);
    if (!admin) return;
    const raw = req.body;
    const rawObj = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
    const parsed = adminPostSchema.safeParse(rawObj);
    if (!parsed.success) {
      return corsRes.status(400).json({ error: 'Invalid payload' });
    }
    const body = parsed.data;
    try {
      const db = await getDb();
      if (body.action === 'devSeedPurge') {
        const result = await purgeDevSeed(db);
        await insertAuditLogSafe(db, {
          actorId: admin.userId,
          action: 'admin.devSeedPurge',
          resource: 'admin',
          meta: { result },
          req,
        });
        return corsRes.status(200).json(result);
      }
      if (body.action === 'dbBackfill') {
        const tournamentId = body.tournamentId ?? null;
        const result = await runDbBackfill(db, { tournamentId });
        await insertAuditLogSafe(db, {
          actorId: admin.userId,
          action: 'admin.dbBackfill',
          resource: 'admin',
          resourceId: tournamentId ?? undefined,
          meta: { result },
          req,
        });
        return corsRes.status(200).json(result);
      }
      if (body.action === 'dbIndexes') {
        const result = await ensureDbIndexes(db);
        await insertAuditLogSafe(db, {
          actorId: admin.userId,
          action: 'admin.dbIndexes',
          resource: 'admin',
          meta: { result },
          req,
        });
        return corsRes.status(200).json(result);
      }
      const result = await runDevSeed(db, { force: !!body.force });
      await insertAuditLogSafe(db, {
        actorId: admin.userId,
        action: 'admin.devSeed',
        resource: 'admin',
        meta: { force: !!body.force, result },
        req,
      });
      return corsRes.status(200).json(result);
    } catch (err) {
      console.error(err);
      captureException(err, { route: 'admin:POST' });
      return corsRes.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method !== 'GET') return withCors(req, res).status(405).json({ error: 'Method not allowed' });

  const type = queryString(req.query.type);

  try {
    const db = await getDb();

    // Liveness/readiness (no auth). Used via Vercel rewrite: GET /api/health -> /api/admin?type=health
    if (type === 'health') {
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
        await db.command({ ping: 1 });
        return corsRes.status(200).json({ ok: true, db: true, revision });
      } catch {
        return corsRes.status(503).json({
          ok: false,
          db: false,
          error: 'Database unreachable',
          revision,
        });
      }
    }

    const admin = await requireAdmin(req, corsRes);
    if (!admin) return;

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
    captureException(err, { route: 'admin:GET' });
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
