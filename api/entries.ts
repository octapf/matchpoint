import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { entriesPostSchema } from '../server/lib/schemas/entriesPost';
import { parseLimitOffset } from '../server/lib/pagination';
import { notifyOne } from '../server/lib/notify';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  try {
    const db = await getDb();
    const col = db.collection('entries');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, userId, guestPlayerId, teamId, inTeamOnly } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (userId && typeof userId === 'string') filter.userId = userId;
      if (guestPlayerId && typeof guestPlayerId === 'string') filter.guestPlayerId = guestPlayerId;
      if (teamId && typeof teamId === 'string') filter.teamId = teamId;
      if (inTeamOnly === '1' || inTeamOnly === 'true') {
        filter.teamId = { $ne: null };
      }

      let cursor = col.find(filter).sort({ createdAt: -1 });
      const q = req.query;
      if (q.limit != null || q.offset != null) {
        const { limit, offset } = parseLimitOffset(q);
        cursor = cursor.skip(offset).limit(limit);
      }
      const docs = await cursor.toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      /** Joining a tournament = joining the waitlist. Entries are created only when a team is formed. */
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = entriesPostSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const { tournamentId, userId } = parsed.data;
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && userId !== actorId) {
        return corsRes.status(403).json({ error: 'You can only register yourself for a tournament' });
      }

      const tournamentsCol = db.collection('tournaments');
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament ID' });
      }
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const tournamentName = String((tournament as { name?: unknown }).name ?? '');
      const tdoc = tournament as { status?: string; organizerOnlyIds?: string[] };
      if (tdoc.status === 'cancelled') {
        return corsRes.status(400).json({ error: 'Tournament is cancelled' });
      }
      const organizeOnly = (tdoc.organizerOnlyIds ?? []).includes(userId);
      if (organizeOnly) {
        return corsRes.status(400).json({
          error: 'Organize-only organizers cannot register as players',
        });
      }

      const waitlistCol = db.collection('waitlist');
      const dupW = await waitlistCol.findOne({ tournamentId, userId });
      if (dupW) {
        return corsRes.status(409).json({ error: 'Already on the waiting list' });
      }
      const playing = await col.findOne({ tournamentId, userId, teamId: { $ne: null } });
      if (playing) {
        return corsRes.status(409).json({ error: 'Already in a team for this tournament' });
      }

      const now = new Date().toISOString();
      await waitlistCol.insertOne({
        tournamentId,
        division: 'mixed',
        userId,
        createdAt: now,
        updatedAt: now,
      });
      await col.deleteMany({ tournamentId, userId, teamId: null });

      // In-app notification.
      await notifyOne(db, {
        userId,
        type: 'tournament.waitlistJoined',
        params: { tournament: tournamentName || 'Tournament' },
        data: { tournamentId },
        dedupeKey: `tournament.waitlistJoined:${tournamentId}`,
      });
      return corsRes.status(201).json({
        ok: true,
        waitlist: true,
        tournamentId,
        userId,
        message: 'Joined waiting list',
      });
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
