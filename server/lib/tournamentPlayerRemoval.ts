import type { ClientSession, Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { isGuestPlayerSlot } from '../../lib/playerSlots';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

/**
 * Remove a player from a tournament: dissolve any team they were on (both players → waiting list),
 * then remove this user's waitlist row if they are leaving entirely.
 */
export async function removePlayerFromTournament(
  db: Db,
  tournamentId: string,
  userId: string,
  options?: { session?: ClientSession; leaveTournament?: boolean }
): Promise<void> {
  const session = options?.session;
  const leaveTournament = options?.leaveTournament !== false;
  const entriesCol = db.collection('entries');
  const teamsCol = db.collection('teams');
  const waitlistCol = db.collection('waitlist');
  const now = new Date().toISOString();
  const tidf = tournamentIdMongoFilter(tournamentId);

  const teamsWithUser = await teamsCol.find({ ...tidf, playerIds: userId }, { session }).toArray();

  for (const team of teamsWithUser) {
    const pids = ((team as { playerIds?: string[] }).playerIds ?? []).filter(Boolean);
    const division = String((team as { division?: unknown }).division ?? 'mixed');
    const tid = team._id as ObjectId;
    await teamsCol.deleteOne({ _id: tid }, { session });
    await entriesCol.deleteMany({ ...tidf, teamId: tid.toString() }, { session });
    for (const pid of pids) {
      if (isGuestPlayerSlot(pid)) continue;
      const dup = await waitlistCol.findOne({ ...tidf, division, userId: pid }, { session });
      if (!dup) {
        await waitlistCol.insertOne({ tournamentId, division, userId: pid, createdAt: now, updatedAt: now }, { session });
      }
    }
  }

  await entriesCol.deleteMany({ ...tidf, userId }, { session });
  if (leaveTournament) {
    await waitlistCol.deleteMany({ ...tidf, userId }, { session });
  }
}
