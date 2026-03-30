import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../server/lib/mongodb';
import { withCors } from '../../../server/lib/cors';
import { isTournamentOrganizer } from '../../../server/lib/organizer';
import { isUserAdmin, resolveActorUserId } from '../../../server/lib/auth';
import { generateClassificationMatches } from '../../../server/lib/classificationMatches';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  const id = req.query.id as string;
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (req.method !== 'POST') {
    return corsRes.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const actingUserId = resolveActorUserId(req);
    if (!actingUserId) {
      return corsRes.status(401).json({ error: 'Authentication required' });
    }

    const db = await getDb();
    const col = db.collection('tournaments');
    const doc = await col.findOne({ _id: new ObjectId(id) });
    if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });

    const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
    const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
    if (!isTournamentOrganizer(doc as { organizerIds?: string[] }, actingUserId) && !actorIsAdmin) {
      return corsRes.status(403).json({ error: 'Only organizers can start tournaments' });
    }

    const startedAt = (doc as { startedAt?: unknown }).startedAt;
    if (startedAt) {
      return corsRes.status(400).json({ error: 'Tournament already started' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const matchesPerOpponentRaw = Number(body?.matchesPerOpponent ?? (doc as { classificationMatchesPerOpponent?: unknown }).classificationMatchesPerOpponent ?? 1);
    const matchesPerOpponent = Math.max(1, Math.min(5, Math.floor(matchesPerOpponentRaw) || 1));
    const pointsToWin = Math.max(1, Math.min(99, Number((doc as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
    const setsPerMatch = Math.max(1, Math.min(7, Number((doc as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

    // Reset previous classification matches (safe to re-start only once; still keep idempotency if needed).
    await db.collection('matches').deleteMany({ tournamentId: id, stage: 'classification' });

    const now = new Date().toISOString();
    await col.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          phase: 'classification',
          startedAt: now,
          classificationMatchesPerOpponent: matchesPerOpponent,
          updatedAt: now,
        },
      }
    );

    const gen = await generateClassificationMatches(db, id, {
      matchesPerOpponent,
      pointsToWin,
      setsPerMatch,
    });

    return corsRes.status(200).json({ startedAt: now, matches: gen });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return corsRes.status(500).json({ error: msg });
  }
}

