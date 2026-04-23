import { ObjectId, type Db } from 'mongodb';
import { getMongoClient } from './mongodb';
import { normalizeGroupCount, tournamentAllowsManualGroupAssignment, validateTournamentGroups } from '../../lib/tournamentGroups';
import { guestPlayerIdFromSlot, isGuestPlayerSlot, normalizeTeamPlayerSlots, parsePlayerSlot } from '../../lib/playerSlots';
import { assertGuestIdsBelongToTournament, resolveTwoSlotGenders } from './guestPlayersDb';
import { insertTeamWithEntriesTx } from './insertTeamWithEntriesTx';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';
import { notifyMany } from './notify';
import { syncTournamentOpenFullStatus } from './tournamentStatusSync';
import type { TournamentDivision } from '../../types';

function tournamentStartedDoc(t: Record<string, unknown>): boolean {
  const phase = String((t as { phase?: unknown }).phase ?? '');
  return (
    !!(t as { startedAt?: unknown }).startedAt ||
    phase === 'classification' ||
    phase === 'categories' ||
    phase === 'completed'
  );
}

/**
 * After a team slot frees up, create the next FIFO team from `team_slot_waitlist` (if any).
 * Skips stale rows where players are no longer eligible.
 */
export async function promoteNextTeamFromSlotWaitlist(db: Db, tournamentId: string): Promise<void> {
  if (!ObjectId.isValid(tournamentId)) return;
  const tournamentsCol = db.collection('tournaments');
  const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!tournament) return;
  if (tournamentStartedDoc(tournament as Record<string, unknown>)) return;

  const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
  const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
  const vg = validateTournamentGroups(maxT, gc);
  if (!vg.ok) return;

  const tidf = tournamentIdMongoFilter(tournamentId);
  const teamsCol = db.collection('teams');
  const wlCol = db.collection('team_slot_waitlist');
  const entriesCol = db.collection('entries');
  const waitlistCol = db.collection('waitlist');

  const tDivs = (tournament as { divisions?: TournamentDivision[] }).divisions;
  const allowGroups = tournamentAllowsManualGroupAssignment(tournament as { groupsDistributedAt?: string | null });

  const countTeamsInGroupForDivision = async (division: TournamentDivision, gi: number): Promise<number> => {
    if (gi === 0) {
      return teamsCol.countDocuments({
        ...tidf,
        division,
        $or: [{ groupIndex: 0 }, { groupIndex: { $exists: false } }, { groupIndex: null }],
      });
    }
    return teamsCol.countDocuments({ ...tidf, division, groupIndex: gi });
  };

  const pickLeastLoadedGroupForDivision = async (division: TournamentDivision): Promise<number> => {
    let best = 0;
    let bestCount = Infinity;
    for (let i = 0; i < vg.groupCount; i++) {
      const c = await countTeamsInGroupForDivision(division, i);
      if (c < bestCount) {
        bestCount = c;
        best = i;
      }
    }
    return best;
  };

  const MAX_ATTEMPTS = 20;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const totalNow = await teamsCol.countDocuments(tidf);
    if (totalNow >= maxT) return;

    const nextBatch = await wlCol.find({ ...tidf, status: 'active' }).sort({ createdAt: 1 }).limit(1).toArray();
    const next = nextBatch[0];
    if (!next) return;

    const qid = next._id as ObjectId;
    const name = String((next as { name?: unknown }).name ?? '').trim();
    const createdBy = String((next as { createdBy?: unknown }).createdBy ?? '');
    const rawIds = (next as { playerIds?: unknown }).playerIds;
    const normalized = normalizeTeamPlayerSlots(rawIds);
    if (!name || !normalized || !createdBy) {
      await wlCol.deleteOne({ _id: qid });
      continue;
    }
    const cleanPlayerIds: [string, string] = normalized;

    const resolvedPair = await resolveTwoSlotGenders(db, tournamentId, tDivs, cleanPlayerIds[0]!, cleanPlayerIds[1]!);
    if (!resolvedPair.ok) {
      await wlCol.deleteOne({ _id: qid });
      continue;
    }
    const pairDivision: TournamentDivision = resolvedPair.pairDivision;
    const s0 = parsePlayerSlot(cleanPlayerIds[0]!)!;
    const s1 = parsePlayerSlot(cleanPlayerIds[1]!)!;

    const playerIdSet = new Set(cleanPlayerIds);
    const existingTeam = await teamsCol.findOne({
      ...tidf,
      playerIds: { $in: Array.from(playerIdSet) },
    });
    if (existingTeam) {
      await wlCol.deleteOne({ _id: qid });
      continue;
    }

    const userIdsOnly = cleanPlayerIds.filter((p) => !isGuestPlayerSlot(p));
    const guestIdsOnly = cleanPlayerIds.map((p) => guestPlayerIdFromSlot(p)).filter(Boolean) as string[];
    const orClauses: Record<string, unknown>[] = [];
    if (userIdsOnly.length) orClauses.push({ userId: { $in: userIdsOnly }, teamId: { $ne: null } });
    if (guestIdsOnly.length) orClauses.push({ guestPlayerId: { $in: guestIdsOnly }, teamId: { $ne: null } });
    const inTeamCount =
      orClauses.length === 0 ? 0 : await entriesCol.countDocuments({ ...tidf, $or: orClauses });
    if (inTeamCount > 0) {
      await wlCol.deleteOne({ _id: qid });
      continue;
    }

    if (s0.kind === 'user') {
      const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s0.userId });
      if (!w) {
        await wlCol.deleteOne({ _id: qid });
        continue;
      }
    }
    if (s1.kind === 'user') {
      const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s1.userId });
      if (!w) {
        await wlCol.deleteOne({ _id: qid });
        continue;
      }
    }
    const guestSlotsN = cleanPlayerIds.filter((p) => isGuestPlayerSlot(p)).length;
    if (guestSlotsN === 1) {
      const uid = cleanPlayerIds.find((p) => !isGuestPlayerSlot(p));
      const gSlot = cleanPlayerIds.find((p) => isGuestPlayerSlot(p));
      if (uid && gSlot) {
        const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: uid });
        if (!w) {
          await wlCol.deleteOne({ _id: qid });
          continue;
        }
        const gid = guestPlayerIdFromSlot(gSlot)!;
        const chk = await assertGuestIdsBelongToTournament(db, tournamentId, [gid]);
        if (!chk.ok) {
          await wlCol.deleteOne({ _id: qid });
          continue;
        }
      }
    }

    // If groups already exist, assign to the least-loaded group for this division.
    // Otherwise keep `null` so team stays "unassigned" until organizer creates/distributes groups.
    let groupIndex: number | null = null;
    if (allowGroups) {
      const least = await pickLeastLoadedGroupForDivision(pairDivision);
      const inTarget = await countTeamsInGroupForDivision(pairDivision, least);
      // If somehow full (shouldn't happen), fall back to null; organizer can rebalance.
      groupIndex = inTarget < vg.teamsPerGroup ? least : null;
    }

    const now = new Date().toISOString();
    const client = await getMongoClient();
    const session = client.startSession();
    let inserted: Record<string, unknown> | null = null;
    try {
      await session.withTransaction(async () => {
        const tdb = client.db('matchpoint');
        const tTeams = tdb.collection('teams');
        const tWl = tdb.collection('team_slot_waitlist');
        const totalInTx = await tTeams.countDocuments(tidf, { session });
        if (totalInTx >= maxT) {
          throw new Error('FULL');
        }
        const del = await tWl.deleteOne({ _id: qid, status: 'active' } as never, { session });
        if (del.deletedCount === 0) {
          throw new Error('NO_CLAIM');
        }
        inserted = await insertTeamWithEntriesTx({
          tdb,
          session,
          tournamentId,
          name,
          cleanPlayerIds,
          pairDivision,
          groupIndex,
          createdBy,
          now,
        });
      });
    } catch (e) {
      if (e instanceof Error && (e.message === 'FULL' || e.message === 'NO_CLAIM')) {
        return;
      }
      console.error('promoteTeamSlotWaitlist transaction', e);
    } finally {
      await session.endSession();
    }

    if (inserted) {
      await syncTournamentOpenFullStatus(db, tournamentId);
      const tournamentName = String((tournament as { name?: unknown }).name ?? '');
      await notifyMany(db, userIdsOnly, {
        type: 'team.created',
        params: { tournament: tournamentName || 'Tournament', team: name },
        data: { tournamentId, teamId: String((inserted as { _id?: unknown })._id ?? '') },
        dedupeKey: `team.created:${tournamentId}:${String((inserted as { _id?: unknown })._id ?? '')}`,
      });
      return;
    }
  }
}
