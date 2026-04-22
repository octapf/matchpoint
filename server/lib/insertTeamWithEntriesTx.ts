import type { ClientSession, Db } from 'mongodb';
import { guestPlayerIdFromSlot, isGuestPlayerSlot } from '../../lib/playerSlots';
import type { TournamentDivision } from '../../types';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

export type InsertTeamWithEntriesTxParams = {
  tdb: Db;
  session: ClientSession;
  tournamentId: string;
  name: string;
  cleanPlayerIds: [string, string];
  pairDivision: TournamentDivision;
  groupIndex: number | null;
  createdBy: string;
  now: string;
};

/**
 * Inserts a team document plus entries and removes real users from the player waitlist.
 * Must run inside an active Mongo transaction (`session`).
 * Keep in sync with `api/teams.ts` POST transaction body.
 */
export async function insertTeamWithEntriesTx(p: InsertTeamWithEntriesTxParams): Promise<Record<string, unknown>> {
  const { tdb, session, tournamentId, name, cleanPlayerIds, pairDivision, groupIndex, createdBy, now } = p;
  const tidf = tournamentIdMongoFilter(tournamentId);
  const teamsCol = tdb.collection('teams');
  const ec = tdb.collection('entries');
  const wc = tdb.collection('waitlist');

  const doc = {
    tournamentId,
    name,
    playerIds: cleanPlayerIds,
    groupIndex,
    division: pairDivision,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  const result = await teamsCol.insertOne(doc, { session });
  const ins = await teamsCol.findOne({ _id: result.insertedId }, { session });
  const inserted = ins as Record<string, unknown> | null;
  if (!inserted) {
    throw new Error('TEAM_INSERT_FAILED');
  }
  const tidStr = result.insertedId.toString();

  for (const pid of cleanPlayerIds) {
    if (isGuestPlayerSlot(pid)) {
      const gid = guestPlayerIdFromSlot(pid)!;
      await ec.deleteMany({ ...tidf, guestPlayerId: gid, teamId: null }, { session });
      await ec.insertOne(
        {
          tournamentId,
          userId: pid,
          guestPlayerId: gid,
          teamId: tidStr,
          status: 'in_team',
          lookingForPartner: false,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
    } else {
      await ec.deleteMany({ ...tidf, userId: pid, teamId: null }, { session });
      await ec.insertOne(
        {
          tournamentId,
          userId: pid,
          teamId: tidStr,
          status: 'in_team',
          lookingForPartner: false,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
    }
  }
  const userIdsOnly = cleanPlayerIds.filter((x) => !isGuestPlayerSlot(x));
  if (userIdsOnly.length) {
    await wc.deleteMany({ ...tidf, userId: { $in: userIdsOnly } }, { session });
  }

  return inserted;
}
