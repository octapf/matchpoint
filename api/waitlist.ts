import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { maxPlayerSlotsForTournament } from '../lib/tournamentGroups';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

const COLLECTION = 'waitlist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  try {
    const db = await getDb();
    const col = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const tournamentId =
        typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
      if (!tournamentId || !ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid or missing tournamentId' });
      }
      const oid = new ObjectId(tournamentId);
      const tournamentFilter = { tournamentId: { $in: [tournamentId, oid] } };
      const rows = await col.find(tournamentFilter).sort({ createdAt: 1 }).toArray();
      const count = rows.length;
      const users = rows.map((r) => ({
        userId: String((r as { userId?: unknown }).userId ?? ''),
        createdAt: String((r as { createdAt?: unknown }).createdAt ?? ''),
      }));
      const sessionUserId = getSessionUserId(req);
      let position: number | null = null;
      if (sessionUserId) {
        const idx = rows.findIndex((r) => (r as { userId?: string }).userId === sessionUserId);
        position = idx >= 0 ? idx + 1 : null;
      }
      return corsRes.status(200).json({ count, position, users });
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { tournamentId, userId } = body as { tournamentId?: string; userId?: string };
      if (!tournamentId || !userId) {
        return corsRes.status(400).json({ error: 'Missing tournamentId or userId' });
      }
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament ID' });
      }
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && userId !== actorId) {
        return corsRes.status(403).json({ error: 'You can only join the waiting list for yourself' });
      }

      const dup = await col.findOne({ tournamentId, userId });
      if (dup) {
        return corsRes.status(409).json({ error: 'Already on the waiting list' });
      }

      const entriesCol = db.collection('entries');
      const inTournament = await entriesCol.findOne({ tournamentId, userId });
      if (inTournament) {
        return corsRes.status(400).json({ error: 'Already registered for this tournament' });
      }

      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const tdoc = tournament as { status?: string; maxTeams?: number };
      if (tdoc.status === 'cancelled') {
        return corsRes.status(400).json({ error: 'Tournament is cancelled' });
      }

      const cap = maxPlayerSlotsForTournament(Number(tdoc.maxTeams ?? 16));
      const entryCount = await entriesCol.countDocuments({ tournamentId });
      if (entryCount < cap) {
        return corsRes.status(400).json({ error: 'Tournament is not full yet — join normally' });
      }

      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        userId,
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = getSessionUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const tournamentId =
        typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
      if (!tournamentId) {
        return corsRes.status(400).json({ error: 'Missing tournamentId' });
      }
      const targetUserId =
        typeof req.query.userId === 'string' && req.query.userId.trim()
          ? req.query.userId.trim()
          : actingUserId;
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && targetUserId !== actingUserId) {
        return corsRes.status(403).json({ error: 'Not allowed' });
      }

      const del = await col.deleteOne({ tournamentId, userId: targetUserId });
      if (del.deletedCount === 0) {
        return corsRes.status(404).json({ error: 'Not on the waiting list' });
      }
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
