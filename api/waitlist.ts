import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { waitlistPostSchema } from '../server/lib/schemas/waitlistPost';
import { waitlistInvitePartnerPostSchema } from '../server/lib/schemas/waitlistInvitePartnerPost';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { notifyOne } from '../server/lib/notify';
import { tournamentIdMongoFilter } from '../server/lib/mongoTournamentIdFilter';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

const COLLECTION = 'waitlist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  try {
    const db = await getDb();
    const col = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const tournamentId =
        typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
      if (!tournamentId || !ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid or missing tournamentId' });
      }
      const division =
        typeof req.query.division === 'string' ? req.query.division.trim() : '';
      if (division !== 'men' && division !== 'women' && division !== 'mixed') {
        return corsRes.status(400).json({ error: 'Invalid or missing division' });
      }
      const tidf = tournamentIdMongoFilter(tournamentId);
      const rows = await col.find({ ...tidf, division }).sort({ createdAt: 1 }).toArray();
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
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (raw && typeof raw === 'object' && (raw as { action?: unknown }).action === 'invitePartner') {
        const parsedInvite = waitlistInvitePartnerPostSchema.safeParse(raw);
        if (!parsedInvite.success) {
          return corsRes.status(400).json({ error: 'Invalid payload' });
        }
        const { tournamentId, division, toUserId } = parsedInvite.data;
        if (toUserId === actorId) {
          return corsRes.status(400).json({ error: 'Cannot invite yourself' });
        }

        const tidfInv = tournamentIdMongoFilter(tournamentId);
        const entriesCol = db.collection('entries');
        const playingActor = await entriesCol.findOne({ ...tidfInv, userId: actorId, teamId: { $ne: null } });
        const playingTarget = await entriesCol.findOne({ ...tidfInv, userId: toUserId, teamId: { $ne: null } });
        if (playingActor || playingTarget) {
          return corsRes.status(400).json({ error: 'One or more players are already in a team' });
        }

        const actorRow = await col.findOne({ ...tidfInv, division, userId: actorId });
        const targetRow = await col.findOne({ ...tidfInv, division, userId: toUserId });
        if (!actorRow) {
          return corsRes.status(400).json({ error: 'You must be on the waiting list to invite someone' });
        }
        if (!targetRow) {
          return corsRes.status(400).json({ error: 'That player is not on the waiting list' });
        }

        const tournamentsCol = db.collection('tournaments');
        const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament) {
          return corsRes.status(404).json({ error: 'Tournament not found' });
        }
        if (String((tournament as { status?: unknown }).status ?? '') === 'cancelled') {
          return corsRes.status(400).json({ error: 'Tournament is cancelled' });
        }

        const usersCol = db.collection('users');
        const fromUser = await usersCol.findOne({ _id: new ObjectId(actorId) });
        const fn = String((fromUser as { firstName?: unknown } | null)?.firstName ?? '').trim();
        const ln = String((fromUser as { lastName?: unknown } | null)?.lastName ?? '').trim();
        const fromName = [fn, ln].filter(Boolean).join(' ') || 'Player';
        const tournamentName = String((tournament as { name?: unknown }).name ?? '').trim() || 'Tournament';

        await notifyOne(db, {
          userId: toUserId,
          type: 'waitlist.teamInvite',
          params: { fromName, tournament: tournamentName },
          data: { tournamentId, fromUserId: actorId },
          dedupeKey: `waitlist.invite:${tournamentId}:${actorId}:${toUserId}`,
        });

        return corsRes.status(200).json({ ok: true });
      }

      const parsed = waitlistPostSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const { tournamentId, userId, division } = parsed.data;
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && userId !== actorId) {
        return corsRes.status(403).json({ error: 'You can only join the waiting list for yourself' });
      }

      const tidfPost = tournamentIdMongoFilter(tournamentId);
      const dup = await col.findOne({ ...tidfPost, division, userId });
      if (dup) {
        return corsRes.status(409).json({ error: 'Already on the waiting list' });
      }

      const entriesCol = db.collection('entries');
      const playing = await entriesCol.findOne({ ...tidfPost, userId, teamId: { $ne: null } });
      if (playing) {
        return corsRes.status(400).json({ error: 'Already in a team for this tournament' });
      }

      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const tdoc = tournament as { status?: string; organizerOnlyIds?: string[] };
      if (tdoc.status === 'cancelled') {
        return corsRes.status(400).json({ error: 'Tournament is cancelled' });
      }
      const organizeOnly = (tdoc.organizerOnlyIds ?? []).includes(userId);
      if (organizeOnly) {
        return corsRes.status(400).json({
          error: 'Organize-only organizers cannot join the player waitlist',
        });
      }

      const targetUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      const gender = String((targetUser as { gender?: unknown } | null)?.gender ?? '');
      const isBinaryGender = gender === 'male' || gender === 'female';
      if (!isBinaryGender) {
        return corsRes.status(400).json({ error: 'Gender must be set (male/female) to join a tournament' });
      }
      const allowed =
        division === 'mixed'
          ? true
          : division === 'men'
            ? gender === 'male'
            : division === 'women'
              ? gender === 'female'
              : false;
      if (!allowed) {
        return corsRes.status(400).json({ error: 'You cannot join this division' });
      }

      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        division,
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
      if (!tournamentId || !ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Missing tournamentId' });
      }
      const division =
        typeof req.query.division === 'string' ? req.query.division.trim() : '';
      if (division !== 'men' && division !== 'women' && division !== 'mixed') {
        return corsRes.status(400).json({ error: 'Invalid or missing division' });
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

      const tidfDel = tournamentIdMongoFilter(tournamentId);
      const existing = await col.findOne({ ...tidfDel, division, userId: targetUserId });
      if (!existing) {
        return corsRes.status(404).json({ error: 'Not on the waiting list' });
      }
      // Leaving a division waitlist does NOT remove you from the tournament.
      await col.deleteOne({ ...tidfDel, division, userId: targetUserId });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
