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
): Promise<string[]> {
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

  type MatchState = {
    teamAId: string;
    teamBId: string;
    status: string;
    winnerId: string;
  };

  const byId = new Map<string, MatchState>();
  for (const m of matches as any[]) {
    const mid = idStr(m);
    if (!mid) continue;
    byId.set(mid, {
      teamAId: key(m.teamAId),
      teamBId: key(m.teamBId),
      status: key(m.status),
      winnerId: key(m.winnerId),
    });
  }

  const completedResultFor = (matchId: string): { winnerId: string; loserId: string } | null => {
    const state = byId.get(matchId);
    if (!state || state.status !== 'completed') return null;
    const { teamAId, teamBId, winnerId } = state;
    if (!winnerId || (winnerId !== teamAId && winnerId !== teamBId)) return null;
    return { winnerId, loserId: winnerId === teamAId ? teamBId : teamAId };
  };

  const resetIds = new Set<string>();
  let changed = true;
  let pass = 0;
  const maxPasses = Math.max(1, matches.length + 1);
  while (changed && pass < maxPasses) {
    changed = false;
    pass += 1;

    for (const m of matches as any[]) {
      const mid = idStr(m);
      if (!mid || mid === editedMatchId) continue;
      const state = byId.get(mid);
      if (!state) continue;

      const advAW = key(m.advanceTeamAFromMatchId);
      const advBW = key(m.advanceTeamBFromMatchId);
      const advAL = key(m.advanceTeamALoserFromMatchId);
      const advBL = key(m.advanceTeamBLoserFromMatchId);

      const desiredA = advAW
        ? completedResultFor(advAW)?.winnerId ?? ''
        : advAL
          ? completedResultFor(advAL)?.loserId ?? ''
          : state.teamAId;
      const desiredB = advBW
        ? completedResultFor(advBW)?.winnerId ?? ''
        : advBL
          ? completedResultFor(advBL)?.loserId ?? ''
          : state.teamBId;

      const slotChanged = desiredA !== state.teamAId || desiredB !== state.teamBId;
      if (!slotChanged) continue;

      state.teamAId = desiredA;
      state.teamBId = desiredB;
      state.status = 'scheduled';
      state.winnerId = '';
      resetIds.add(mid);
      changed = true;
    }
  }

  const bulk: any[] = [];
  for (const m of matches as any[]) {
    const mid = idStr(m);
    if (!mid) continue;
    if (!resetIds.has(mid)) continue;
    const state = byId.get(mid);
    if (!state) continue;

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

    if (state.teamAId) $set.teamAId = state.teamAId;
    else $unset.teamAId = '';
    if (state.teamBId) $set.teamBId = state.teamBId;
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
  return [...resetIds];
}
