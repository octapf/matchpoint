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
          bracketRound: 1,
          orderIndex: 1,
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
  const matchById = new Map<string, any>();
  const winnerByMatchId = new Map<string, string>();
  const loserByMatchId = new Map<string, string>();
  for (const m of matches as any[]) {
    const mid = idStr(m);
    if (mid) matchById.set(mid, m);
    if (key(m.status) !== 'completed') continue;
    const w = key(m.winnerId);
    const a = key(m.teamAId);
    const b = key(m.teamBId);
    if (!mid || !w || (w !== a && w !== b)) continue;
    winnerByMatchId.set(mid, w);
    loserByMatchId.set(mid, w === a ? b : a);
  }

  const invalidatedMatchIds = new Set<string>();
  const desiredSlotsByMatchId = new Map<string, { teamAId: string; teamBId: string }>();
  const plannedMatches = [...(matches as any[])].sort((a, b) => {
    const ar = Number(a.bracketRound ?? 0);
    const br = Number(b.bracketRound ?? 0);
    if (ar !== br) return ar - br;
    const ao = Number(a.orderIndex ?? 0);
    const bo = Number(b.orderIndex ?? 0);
    if (ao !== bo) return ao - bo;
    return idStr(a).localeCompare(idStr(b));
  });

  const resolveFeed = (sourceMatchId: string, kind: 'winner' | 'loser'): string => {
    if (!sourceMatchId) return '';
    if (invalidatedMatchIds.has(sourceMatchId)) return '';
    return kind === 'winner'
      ? winnerByMatchId.get(sourceMatchId) ?? ''
      : loserByMatchId.get(sourceMatchId) ?? '';
  };

  let changed = true;
  while (changed) {
    changed = false;

    for (const m of plannedMatches) {
      const mid = idStr(m);
      if (!mid || mid === editedMatchId) continue;

      const advAW = key(m.advanceTeamAFromMatchId);
      const advBW = key(m.advanceTeamBFromMatchId);
      const advAL = key(m.advanceTeamALoserFromMatchId);
      const advBL = key(m.advanceTeamBLoserFromMatchId);

      const curA = key(m.teamAId);
      const curB = key(m.teamBId);

      const desiredA = advAW ? resolveFeed(advAW, 'winner') : advAL ? resolveFeed(advAL, 'loser') : curA;
      const desiredB = advBW ? resolveFeed(advBW, 'winner') : advBL ? resolveFeed(advBL, 'loser') : curB;

      const slotChanged = desiredA !== curA || desiredB !== curB;
      if (!slotChanged) continue;

      const previousDesired = desiredSlotsByMatchId.get(mid);
      if (previousDesired?.teamAId !== desiredA || previousDesired?.teamBId !== desiredB) {
        desiredSlotsByMatchId.set(mid, { teamAId: desiredA, teamBId: desiredB });
      }
      if (!invalidatedMatchIds.has(mid)) {
        invalidatedMatchIds.add(mid);
        changed = true;
      }
    }
  }

  const bulk: any[] = [];
  for (const [mid, desired] of desiredSlotsByMatchId.entries()) {
    const m = matchById.get(mid);
    if (!m) continue;

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

    if (desired.teamAId) $set.teamAId = desired.teamAId;
    else $unset.teamAId = '';
    if (desired.teamBId) $set.teamBId = desired.teamBId;
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
