import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb, getMongoClient } from '../../server/lib/mongodb';
import { teamPatchSchema } from '../../server/lib/schemas/teamPatch';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { isUserAdmin, loadActorUserWithAdminRefresh, resolveActorUserId } from '../../server/lib/auth';
import {
  normalizeGroupCount,
  tournamentAllowsManualGroupAssignment,
  validateTournamentGroups,
  teamGroupIndex,
} from '../../lib/tournamentGroups';
import { countTeamsInGroup } from '../../server/lib/tournamentGroupDb';
import { syncTournamentOpenFullStatus } from '../../server/lib/tournamentStatusSync';
import { notifyMany } from '../../server/lib/notify';
import { guestPlayerIdFromSlot, isGuestPlayerSlot, normalizeTeamPlayerSlots } from '../../lib/playerSlots';
import { resolveTwoSlotGenders } from '../../server/lib/guestPlayersDb';
import { tournamentIdMongoFilter } from '../../server/lib/mongoTournamentIdFilter';
import { promoteNextTeamFromSlotWaitlist } from '../../server/lib/promoteTeamSlotWaitlist';
import type { TournamentDivision } from '../../types';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

function firstQueryString(q: string | string[] | undefined): string | undefined {
  if (q == null) return undefined;
  return typeof q === 'string' ? q : q[0];
}

function normalizePlayerIds(raw: unknown): [string, string] | null {
  return normalizeTeamPlayerSlots(raw);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  const id = firstQueryString(req.query.id as string | string[] | undefined);
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('teams');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsedBody = teamPatchSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const body = { ...parsedBody.data } as Record<string, unknown>;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const team = await col.findOne({ _id: oid });
      if (!team) return corsRes.status(404).json({ error: 'Team not found' });
      const tournamentId = team.tournamentId as string;
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament on team' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
      const tidfTeam = tournamentIdMongoFilter(tournamentId);
      if (!ObjectId.isValid(actingUserId)) {
        return corsRes.status(400).json({ error: 'Invalid acting user' });
      }
      const actorUserPatch = await loadActorUserWithAdminRefresh(db, actingUserId);
      if (!actorUserPatch) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const actorIsAdminPatch = isUserAdmin(actorUserPatch as { role?: string; email?: string });
      const isOrganizerOrAdmin =
        isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId) || actorIsAdminPatch;
      const teamPlayerIds = ((team as { playerIds?: string[] }).playerIds ?? []).filter(Boolean);
      const isTeamMember = teamPlayerIds.includes(actingUserId);

      if (!isOrganizerOrAdmin && !isTeamMember) {
        return corsRes.status(403).json({ error: 'Only organizers can update this team' });
      }

      const hasName = body.name !== undefined;
      const hasPlayerIds = body.playerIds !== undefined;
      const hasGroupIndex = body.groupIndex !== undefined;

      if (!isOrganizerOrAdmin && isTeamMember) {
        if (hasPlayerIds || hasGroupIndex) {
          return corsRes.status(403).json({ error: 'Only organizers can change team roster or group' });
        }
        if (!hasName) {
          return corsRes.status(400).json({ error: 'No valid fields to update' });
        }
      }

      const allowed = ['name', 'playerIds', 'groupIndex'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      const tournamentStartedPatch =
        !!(tournament as { startedAt?: unknown }).startedAt ||
        (tournament as { phase?: unknown }).phase === 'classification' ||
        (tournament as { phase?: unknown }).phase === 'categories' ||
        (tournament as { phase?: unknown }).phase === 'completed';
      if (update.name !== undefined && tournamentStartedPatch) {
        return corsRes.status(400).json({ error: 'Team name cannot be changed after the tournament has started' });
      }

      if (update.groupIndex !== undefined) {
        if (!tournamentAllowsManualGroupAssignment(tournament as { groupsDistributedAt?: string | null })) {
          return corsRes.status(400).json({ error: 'Groups are not created yet. Use Create groups in the tournament first.' });
        }
        const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
        const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
        const vg = validateTournamentGroups(maxT, gc);
        if (!vg.ok) {
          return corsRes.status(400).json({ error: 'Tournament group configuration is invalid' });
        }
        let nextGi = typeof update.groupIndex === 'number' ? update.groupIndex : parseInt(String(update.groupIndex), 10);
        if (!Number.isFinite(nextGi) || nextGi < 0) nextGi = 0;
        nextGi = Math.min(vg.groupCount - 1, Math.floor(nextGi));
        update.groupIndex = nextGi;
        const currentGi = teamGroupIndex(team as { groupIndex?: number });
        if (nextGi !== currentGi) {
          const inTarget = await countTeamsInGroup(db, tournamentId, nextGi);
          if (inTarget >= vg.teamsPerGroup) {
            return corsRes.status(400).json({ error: 'Target group is full' });
          }
        }
      }

      if (update.playerIds !== undefined) {
        const clean = normalizePlayerIds(update.playerIds);
        if (!clean) {
          return corsRes.status(400).json({ error: 'Teams must have exactly 2 distinct players' });
        }
        // Prevent a player from being in 2 teams in the same tournament.
        const conflict = await col.findOne({
          _id: { $ne: oid },
          ...tidfTeam,
          playerIds: { $in: clean },
        });
        if (conflict) {
          return corsRes.status(400).json({ error: 'You can only be in one team per tournament' });
        }
        update.playerIds = clean;

        const prevPids = ((team as { playerIds?: string[] }).playerIds ?? []).filter(Boolean);
        const division = String((team as { division?: unknown }).division ?? 'mixed');
        const tDivs = (tournament as { divisions?: TournamentDivision[] }).divisions;
        const pairRes = await resolveTwoSlotGenders(db, tournamentId, tDivs, clean[0], clean[1]);
        if (!pairRes.ok) {
          return corsRes.status(400).json({ error: pairRes.error });
        }
        if (pairRes.pairDivision !== division) {
          return corsRes.status(400).json({ error: 'Player pair does not match this team division' });
        }

        const added = clean.filter((pid) => !prevPids.includes(pid));
        const waitlistCol = db.collection('waitlist');
        for (const pid of added) {
          if (isGuestPlayerSlot(pid)) continue;
          const w = await waitlistCol.findOne({ ...tidfTeam, division, userId: pid });
          if (!w) {
            return corsRes.status(400).json({ error: 'Registered player must be on the waiting list for this division' });
          }
        }

        update.updatedAt = new Date().toISOString();
        const now = update.updatedAt as string;
        const teamIdStr = id;

        const client = await getMongoClient();
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            const tdb = client.db('matchpoint');
            const teamsCol = tdb.collection('teams');
            const ec = tdb.collection('entries');
            const wc = tdb.collection('waitlist');
            await teamsCol.updateOne({ _id: oid }, { $set: update }, { session });

            const removed = prevPids.filter((pid) => !clean.includes(pid));
            for (const pid of removed) {
              if (isGuestPlayerSlot(pid)) {
                const gid = guestPlayerIdFromSlot(pid)!;
                await ec.deleteMany({ ...tidfTeam, guestPlayerId: gid }, { session });
              } else {
                await ec.deleteMany({ ...tidfTeam, userId: pid }, { session });
                const dup = await wc.findOne({ ...tidfTeam, division, userId: pid }, { session });
                if (!dup) {
                  await wc.insertOne(
                    {
                      tournamentId,
                      division,
                      userId: pid,
                      createdAt: now,
                      updatedAt: now,
                    },
                    { session }
                  );
                }
              }
            }

            for (const pid of clean) {
              if (isGuestPlayerSlot(pid)) {
                const gid = guestPlayerIdFromSlot(pid)!;
                await ec.deleteMany({ ...tidfTeam, guestPlayerId: gid, teamId: null }, { session });
                const existing = await ec.findOne({ ...tidfTeam, guestPlayerId: gid }, { session });
                const entryPayload = {
                  teamId: teamIdStr,
                  status: 'in_team' as const,
                  lookingForPartner: false,
                  updatedAt: now,
                };
                if (existing) {
                  await ec.updateOne({ _id: existing._id }, { $set: entryPayload }, { session });
                } else {
                  await ec.insertOne(
                    {
                      tournamentId,
                      // Avoid unique index collisions on (tournamentId, userId) for guest entries.
                      // This is not a real user id; guest identity is `guestPlayerId`.
                      userId: pid,
                      guestPlayerId: gid,
                      ...entryPayload,
                      createdAt: now,
                    },
                    { session }
                  );
                }
              } else {
                await ec.deleteMany({ ...tidfTeam, userId: pid, teamId: null }, { session });
                const existing = await ec.findOne({ ...tidfTeam, userId: pid }, { session });
                const entryPayload = {
                  teamId: teamIdStr,
                  status: 'in_team' as const,
                  lookingForPartner: false,
                  updatedAt: now,
                };
                if (existing) {
                  await ec.updateOne({ _id: existing._id }, { $set: entryPayload }, { session });
                } else {
                  await ec.insertOne(
                    {
                      tournamentId,
                      userId: pid,
                      ...entryPayload,
                      createdAt: now,
                    },
                    { session }
                  );
                }
              }
            }

            const userIdsInTeam = clean.filter((p) => !isGuestPlayerSlot(p));
            if (userIdsInTeam.length) {
              await wc.deleteMany({ ...tidfTeam, userId: { $in: userIdsInTeam } }, { session });
            }
          });
        } finally {
          await session.endSession();
        }

        const updatedTeam = await col.findOne({ _id: oid });
        if (!updatedTeam) return corsRes.status(404).json({ error: 'Team not found' });
        await syncTournamentOpenFullStatus(db, tournamentId);
        return corsRes.status(200).json(serializeDoc(updatedTeam as Record<string, unknown>));
      }

      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const team = await col.findOne({ _id: oid });
      if (!team) return corsRes.status(404).json({ error: 'Team not found' });
      const tournamentId = team.tournamentId as string;
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament on team' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
      const started =
        !!(tournament as { startedAt?: unknown }).startedAt ||
        (tournament as { phase?: unknown }).phase === 'classification' ||
        (tournament as { phase?: unknown }).phase === 'categories' ||
        (tournament as { phase?: unknown }).phase === 'completed';
      if (started) {
        return corsRes.status(400).json({ error: 'Tournament already started' });
      }
      const tidfDelTeam = tournamentIdMongoFilter(tournamentId);
      if (!ObjectId.isValid(actingUserId)) {
        return corsRes.status(400).json({ error: 'Invalid acting user' });
      }
      const actorUserDel = await loadActorUserWithAdminRefresh(db, actingUserId);
      if (!actorUserDel) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const actorIsAdminDel = isUserAdmin(actorUserDel as { role?: string; email?: string });
      if (!isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId) && !actorIsAdminDel) {
        return corsRes.status(403).json({ error: 'Only organizers can remove a team' });
      }

      const now = new Date().toISOString();
      const playerIds = ((team as { playerIds?: string[] }).playerIds ?? []).filter(Boolean);
      const division = String((team as { division?: unknown }).division ?? 'mixed');
      const client = await getMongoClient();
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const tdb = client.db('matchpoint');
          const ec = tdb.collection('entries');
          const wc = tdb.collection('waitlist');
          const tc = tdb.collection('teams');
          await ec.deleteMany({ ...tidfDelTeam, teamId: id }, { session });
          const result = await tc.deleteOne({ _id: oid }, { session });
          if (result.deletedCount === 0) {
            throw new Error('TEAM_NOT_FOUND');
          }
          for (const pid of playerIds) {
            if (isGuestPlayerSlot(pid)) continue;
            const dup = await wc.findOne({ ...tidfDelTeam, division, userId: pid }, { session });
            if (!dup) {
              await wc.insertOne({ tournamentId, division, userId: pid, createdAt: now, updatedAt: now }, { session });
            }
          }
        });
      } catch (e) {
        if (e instanceof Error && e.message === 'TEAM_NOT_FOUND') {
          return corsRes.status(404).json({ error: 'Team not found' });
        }
        throw e;
      } finally {
        await session.endSession();
      }
      await syncTournamentOpenFullStatus(db, tournamentId);
      await promoteNextTeamFromSlotWaitlist(db, tournamentId);

      // In-app notifications: team dissolved (both players back to waitlist).
      const tournamentName = String((tournament as { name?: unknown }).name ?? '');
      await notifyMany(db, playerIds.filter((p) => !isGuestPlayerSlot(p)), {
        type: 'team.dissolved',
        params: { tournament: tournamentName || 'Tournament' },
        data: { tournamentId },
        dedupeKey: `team.dissolved:${tournamentId}:${id}`,
      });

      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
