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

/**
 * If a completed category match is edited and its WINNER changes, any downstream match that depends on it
 * must be reset (scores cleared + status scheduled), and slots must be recomputed to match the new bracket.
 *
 * This prevents "pending card but completed inside" desync when team slots change on downstream matches.
 */
export async function recomputeCategoryBracketAfterWinnerChange(
  db: Db,
  tournamentId: string,
  division: string,
  category: string,
  updatedAtIso: string,
  editedMatchId: string
): Promise<void> {
  const col = db.collection('matches');
  const matches = await col
    .find(
      { tournamentId, stage: 'category', division, category },
      {
        projection: {
          _id: 1,
          teamAId: 1,
          teamBId: 1,
          status: 1,
          winnerId: 1,
          pointsA: 1,
          pointsB: 1,
          setsWonA: 1,
          setsWonB: 1,
          advanceTeamAFromMatchId: 1,
          advanceTeamBFromMatchId: 1,
          advanceTeamALoserFromMatchId: 1,
          advanceTeamBLoserFromMatchId: 1,
        },
      }
    )
    .toArray();

  const key = (x: unknown) => String(x ?? '').trim();
  const idStr = (x: unknown) => String((x as any)?._id ?? '').trim();

  // Compute (winner, loser) for every completed match with a valid winner.
  const winnerByMatchId = new Map<string, string>();
  const loserByMatchId = new Map<string, string>();
  for (const m of matches as any[]) {
    if (key(m.status) !== 'completed') continue;
    const mid = idStr(m);
    const w = key(m.winnerId);
    const a = key(m.teamAId);
    const b = key(m.teamBId);
    if (!mid || !w || (w !== a && w !== b)) continue;
    winnerByMatchId.set(mid, w);
    loserByMatchId.set(mid, w === a ? b : a);
  }

  const bulk: any[] = [];
  for (const m of matches as any[]) {
    const mid = idStr(m);
    if (!mid) continue;
    if (mid === editedMatchId) continue;

    const advAW = key(m.advanceTeamAFromMatchId);
    const advBW = key(m.advanceTeamBFromMatchId);
    const advAL = key(m.advanceTeamALoserFromMatchId);
    const advBL = key(m.advanceTeamBLoserFromMatchId);

    const curA = key(m.teamAId);
    const curB = key(m.teamBId);

    const desiredA =
      advAW ? winnerByMatchId.get(advAW) ?? '' : advAL ? loserByMatchId.get(advAL) ?? '' : curA;
    const desiredB =
      advBW ? winnerByMatchId.get(advBW) ?? '' : advBL ? loserByMatchId.get(advBL) ?? '' : curB;

    const slotChanged = desiredA !== curA || desiredB !== curB;
    if (!slotChanged) continue;

    const $set: Record<string, unknown> = { updatedAt: updatedAtIso, status: 'scheduled' };
    const $unset: Record<string, ''> = {
      winnerId: '',
      pointsA: '',
      pointsB: '',
      setsWonA: '',
      setsWonB: '',
      startedAt: '',
      completedAt: '',
      durationSeconds: '',
      scoreEvents: '',
      lastPointAt: '',
      refereeUserId: '',
      refereeLockExpiresAt: '',
      servingPlayerId: '',
      serveIndex: '',
    };

    if (desiredA) $set.teamAId = desiredA;
    else $unset.teamAId = '';
    if (desiredB) $set.teamBId = desiredB;
    else $unset.teamBId = '';

    bulk.push({
      updateOne: {
        filter: { _id: (m as any)._id },
        update: { $set, $unset },
      },
    });
  }

  if (bulk.length) {
    await col.bulkWrite(bulk, { ordered: false });
  }
}
