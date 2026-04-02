import type { Db } from 'mongodb';

/**
 * When a category knockout match completes, push winner/loser into downstream slots.
 */
export async function applyCategoryKnockoutAdvances(
  db: Db,
  tournamentId: string,
  completedMatchId: string,
  winnerId: string,
  loserId: string,
  updatedAtIso: string
): Promise<void> {
  const col = db.collection('matches');
  const filterBase = { tournamentId, stage: 'category' as const };

  await col.updateMany(
    { ...filterBase, advanceTeamAFromMatchId: completedMatchId },
    { $set: { teamAId: winnerId, updatedAt: updatedAtIso } }
  );
  await col.updateMany(
    { ...filterBase, advanceTeamBFromMatchId: completedMatchId },
    { $set: { teamBId: winnerId, updatedAt: updatedAtIso } }
  );
  await col.updateMany(
    { ...filterBase, advanceTeamALoserFromMatchId: completedMatchId },
    { $set: { teamAId: loserId, updatedAt: updatedAtIso } }
  );
  await col.updateMany(
    { ...filterBase, advanceTeamBLoserFromMatchId: completedMatchId },
    { $set: { teamBId: loserId, updatedAt: updatedAtIso } }
  );
}
