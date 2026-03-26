import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { maxPlayerSlotsForTournament } from '../lib/tournamentGroups';
import { syncTournamentOpenFullStatus } from '../server/lib/tournamentStatusSync';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  try {
    const db = await getDb();
    const col = db.collection('entries');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, userId, teamId } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (userId && typeof userId === 'string') filter.userId = userId;
      if (teamId && typeof teamId === 'string') filter.teamId = teamId;

      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { tournamentId, userId, lookingForPartner } = body;
      if (!tournamentId || !userId) {
        return corsRes.status(400).json({ error: 'Missing tournamentId or userId' });
      }
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && userId !== actorId) {
        return corsRes.status(403).json({ error: 'You can only register yourself for a tournament' });
      }
      const dup = await col.findOne({ tournamentId, userId });
      if (dup) {
        return corsRes.status(409).json({ error: 'Already registered for this tournament' });
      }

      const tournamentsCol = db.collection('tournaments');
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament ID' });
      }
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const tdoc = tournament as { status?: string; maxTeams?: number };
      if (tdoc.status === 'cancelled') {
        return corsRes.status(400).json({ error: 'Tournament is cancelled' });
      }
      const cap = maxPlayerSlotsForTournament(Number(tdoc.maxTeams ?? 16));
      const entryCount = await col.countDocuments({ tournamentId });
      if (entryCount >= cap) {
        return corsRes.status(400).json({ error: 'Tournament is full' });
      }

      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        userId,
        teamId: null,
        lookingForPartner: !!lookingForPartner,
        status: 'joined',
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      await syncTournamentOpenFullStatus(db, tournamentId);
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
