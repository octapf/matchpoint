import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

/**
 * Remove a player from a tournament: delete their entry and dissolve any teams they were on
 * (same rules as account deletion, scoped to one tournament).
 */
export async function removePlayerFromTournament(db: Db, tournamentId: string, userId: string): Promise<void> {
  const entriesCol = db.collection('entries');
  const teamsCol = db.collection('teams');
  const now = new Date().toISOString();

  await entriesCol.deleteMany({ tournamentId, userId });

  const teamsWithUser = await teamsCol.find({ tournamentId, playerIds: userId }).toArray();

  for (const team of teamsWithUser) {
    const tid = team._id as ObjectId;
    const teamIdStr = tid.toString();
    await teamsCol.deleteOne({ _id: tid });
    await entriesCol.updateMany(
      { $or: [{ teamId: teamIdStr }, { teamId: tid }] },
      {
        $set: {
          teamId: null,
          status: 'joined',
          lookingForPartner: true,
          updatedAt: now,
        },
      }
    );
  }
}
