import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { isUserAdmin, resolveActorUserId } from '../../server/lib/auth';
import { normalizeGroupCount, validateTournamentGroups, teamGroupIndex } from '../../lib/tournamentGroups';
import { syncTournamentOpenFullStatus } from '../../server/lib/tournamentStatusSync';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  const id = req.query.id as string;
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid tournament ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('tournaments');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });
      const serialized = serializeDoc(doc as Record<string, unknown>)!;

      // Attach the same count fields as the list endpoint so cards and detail stay consistent.
      const entriesCol = db.collection('entries');
      const teamsCol = db.collection('teams');
      const waitCol = db.collection('waitlist');

      const [entriesCount, teamsList, waitlistCount] = await Promise.all([
        entriesCol.countDocuments({ tournamentId: { $in: [id, oid] } }),
        teamsCol.find({ tournamentId: { $in: [id, oid] } }).project({ groupIndex: 1 }).toArray(),
        waitCol.countDocuments({ tournamentId: { $in: [id, oid] } }),
      ]);

      const teamsCount = teamsList.length;
      const gc = normalizeGroupCount((serialized as { groupCount?: number }).groupCount);
      const groupsSet = new Set<number>();
      for (const row of teamsList) {
        const gi = teamGroupIndex(row as { groupIndex?: number });
        const clamped = Math.min(gc - 1, Math.max(0, gi));
        groupsSet.add(clamped);
      }

      return corsRes.status(200).json({
        ...serialized,
        entriesCount,
        teamsCount,
        groupsWithTeamsCount: groupsSet.size,
        waitlistCount,
      });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
      }
      const current = await col.findOne({ _id: oid });
      if (!current) return corsRes.status(404).json({ error: 'Tournament not found' });
      const cur = current as Record<string, unknown>;
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(cur as { organizerIds?: string[] }, actingUserId);
      if (!isOrg && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can update this tournament' });
      }

      const allowed = [
        'name',
        'date',
        'startDate',
        'endDate',
        'location',
        'description',
        'maxTeams',
        'groupCount',
        'status',
        'organizerIds',
      ];
      const update: Record<string, unknown> = {};
      const curStatus = (cur as { status?: string }).status;
      for (const k of allowed) {
        if (body[k] === undefined) continue;
        if (k === 'status') {
          const s = body[k];
          const st = typeof s === 'string' ? s.trim() : s;
          if (st === 'cancelled') {
            update.status = 'cancelled';
          } else if (st === 'open' && curStatus === 'cancelled') {
            update.status = 'open';
          }
          // Ignore client-sent `open` / `full` — those are derived from signups.
          continue;
        }
        update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      if (update.maxTeams !== undefined || update.groupCount !== undefined) {
        const curDoc = cur as { maxTeams?: number; groupCount?: number };
        const nextMax =
          update.maxTeams !== undefined ? Number(update.maxTeams) : Number(curDoc.maxTeams ?? 16);
        const nextGcRaw = update.groupCount !== undefined ? update.groupCount : curDoc.groupCount;
        const nextGc = normalizeGroupCount(nextGcRaw);
        const vg = validateTournamentGroups(nextMax, nextGc);
        if (!vg.ok) {
          const err =
            vg.reason === 'divisible'
              ? 'Max teams must be divisible by the number of groups'
              : vg.reason === 'minPerGroup'
                ? 'Each group must allow at least 2 teams (increase max teams or reduce groups)'
                : 'Invalid max teams';
          return corsRes.status(400).json({ error: err });
        }
        update.groupCount = vg.groupCount;
        update.maxTeams = nextMax;
        const teamsCol = db.collection('teams');
        const teamsList = await teamsCol.find({ tournamentId: { $in: [id, oid] } }).toArray();
        const perGroup = new Map<number, number>();
        for (const tm of teamsList) {
          const gi = teamGroupIndex(tm as { groupIndex?: number });
          if (gi >= vg.groupCount) {
            return corsRes.status(400).json({
              error:
                'Some teams use a group that would not exist. Move teams in the roster before reducing groups.',
            });
          }
          perGroup.set(gi, (perGroup.get(gi) ?? 0) + 1);
        }
        for (let i = 0; i < vg.groupCount; i++) {
          if ((perGroup.get(i) ?? 0) > vg.teamsPerGroup) {
            return corsRes.status(400).json({
              error: 'Too many teams in a group for these settings. Move or remove teams first.',
            });
          }
        }
      }

      const prevOrganizers = (cur.organizerIds as string[]) ?? [];
      if (update.organizerIds !== undefined) {
        const nextOrganizers = update.organizerIds as string[];
        if (!Array.isArray(nextOrganizers) || nextOrganizers.length === 0) {
          return corsRes.status(400).json({ error: 'At least one organizer is required' });
        }
        if (!actorIsAdmin) {
          const entriesCol = db.collection('entries');
          const entryUserIds = new Set(
            (await entriesCol.find({ tournamentId: { $in: [id, oid] } }).toArray()).map((e) => e.userId as string)
          );
          for (const uid of nextOrganizers) {
            if (prevOrganizers.includes(uid)) continue;
            if (!entryUserIds.has(uid)) {
              return corsRes.status(400).json({
                error: 'New organizers must be players who joined this tournament',
              });
            }
          }
        } else {
          for (const uid of nextOrganizers) {
            if (!ObjectId.isValid(uid)) {
              return corsRes.status(400).json({ error: 'Invalid organizer user id' });
            }
          }
        }
      }

      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Tournament not found' });
      const afterStatus = (result as { status?: string }).status;
      if (afterStatus !== 'cancelled') {
        await syncTournamentOpenFullStatus(db, id);
      }
      const fresh = await col.findOne({ _id: oid });
      return corsRes.status(200).json(serializeDoc((fresh ?? result) as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
      }
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!isTournamentOrganizer(doc as { organizerIds?: string[] }, actingUserId) && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can delete this tournament' });
      }
      const entriesCol = db.collection('entries');
      const entryCount = await entriesCol.countDocuments({ tournamentId: { $in: [id, oid] } });
      if (entryCount > 0) {
        return corsRes.status(400).json({
          error:
            'Cannot delete tournament while players are registered. Remove all players from the roster first.',
        });
      }
      await entriesCol.deleteMany({ tournamentId: { $in: [id, oid] } });
      await db.collection('teams').deleteMany({ tournamentId: { $in: [id, oid] } });
      await col.deleteOne({ _id: oid });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
