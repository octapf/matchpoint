import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { isUserAdmin, resolveActorUserId } from '../../server/lib/auth';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

function firstQueryString(q: string | string[] | undefined): string | undefined {
  if (q == null) return undefined;
  return typeof q === 'string' ? q : q[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  const id = firstQueryString(req.query.id as string | string[] | undefined);
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid match ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('matches');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Match not found' });
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method !== 'PATCH') {
      return corsRes.status(405).json({ error: 'Method not allowed' });
    }

    const actingUserId = resolveActorUserId(req);
    if (!actingUserId) {
      return corsRes.status(401).json({ error: 'Authentication required' });
    }

    const match = await col.findOne({ _id: oid });
    if (!match) return corsRes.status(404).json({ error: 'Match not found' });
    const tournamentId = String((match as { tournamentId?: unknown }).tournamentId ?? '');
    if (!tournamentId || !ObjectId.isValid(tournamentId)) {
      return corsRes.status(400).json({ error: 'Invalid tournament on match' });
    }

    const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
    if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
    const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
    const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
    if (!isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId) && !actorIsAdmin) {
      return corsRes.status(403).json({ error: 'Only organizers can update matches' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const setsWonA = Number(body?.setsWonA);
    const setsWonB = Number(body?.setsWonB);
    const pointsA = body?.pointsA != null ? Number(body.pointsA) : undefined;
    const pointsB = body?.pointsB != null ? Number(body.pointsB) : undefined;
    if (!Number.isFinite(setsWonA) || !Number.isFinite(setsWonB) || setsWonA < 0 || setsWonB < 0) {
      return corsRes.status(400).json({ error: 'Invalid setsWonA/setsWonB' });
    }
    const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
    const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');
    const winnerId = setsWonA === setsWonB ? '' : setsWonA > setsWonB ? teamAId : teamBId;
    if (!winnerId) {
      return corsRes.status(400).json({ error: 'Matches cannot end in a tie' });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      setsWonA: Math.floor(setsWonA),
      setsWonB: Math.floor(setsWonB),
      winnerId,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    };
    if (Number.isFinite(pointsA)) update.pointsA = Math.floor(pointsA!);
    if (Number.isFinite(pointsB)) update.pointsB = Math.floor(pointsB!);

    const result = await col.findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: 'after' });
    if (!result) return corsRes.status(404).json({ error: 'Match not found' });
    return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}

