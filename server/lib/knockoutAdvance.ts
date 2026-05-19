import type { Db } from 'mongodb';
import { voidBetsForMatches } from './tournamentBets';

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

  type MatchState = {
    teamAId: string;
    teamBId: string;
    status: string;
    winnerId: string;
  };
  const stateByMatchId = new Map<string, MatchState>();
  const changedByMatchId = new Map<string, { doc: any; state: MatchState }>();
  for (const m of matches as any[]) {
    const mid = idStr(m);
    if (!mid) continue;
    stateByMatchId.set(mid, {
      teamAId: key(m.teamAId),
      teamBId: key(m.teamBId),
      status: key(m.status),
      winnerId: key(m.winnerId),
    });
  }

  const winnerLoser = (matchId: string): { winner: string; loser: string } | null => {
    const s = stateByMatchId.get(matchId);
    if (!s || s.status !== 'completed') return null;
    if (!s.winnerId || (s.winnerId !== s.teamAId && s.winnerId !== s.teamBId)) return null;
    return { winner: s.winnerId, loser: s.winnerId === s.teamAId ? s.teamBId : s.teamAId };
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches as any[]) {
      const mid = idStr(m);
      if (!mid) continue;
      if (mid === editedMatchId) continue;

      const advAW = key(m.advanceTeamAFromMatchId);
      const advBW = key(m.advanceTeamBFromMatchId);
      const advAL = key(m.advanceTeamALoserFromMatchId);
      const advBL = key(m.advanceTeamBLoserFromMatchId);

      const cur = stateByMatchId.get(mid);
      if (!cur) continue;

      const wlA = advAW ? winnerLoser(advAW) : advAL ? winnerLoser(advAL) : null;
      const wlB = advBW ? winnerLoser(advBW) : advBL ? winnerLoser(advBL) : null;
      const desiredA = advAW ? wlA?.winner ?? '' : advAL ? wlA?.loser ?? '' : cur.teamAId;
      const desiredB = advBW ? wlB?.winner ?? '' : advBL ? wlB?.loser ?? '' : cur.teamBId;

      const slotChanged = desiredA !== cur.teamAId || desiredB !== cur.teamBId;
      if (!slotChanged) continue;

      stateByMatchId.set(mid, {
        teamAId: desiredA,
        teamBId: desiredB,
        status: 'scheduled',
        winnerId: '',
      });
      changedByMatchId.set(mid, {
        doc: m,
        state: {
          teamAId: desiredA,
          teamBId: desiredB,
          status: 'scheduled',
          winnerId: '',
        },
      });
      changed = true;
    }
  }

  const bulk: any[] = [];
  for (const { doc: m, state } of changedByMatchId.values()) {
    const $set: Record<string, unknown> = { updatedAt: updatedAtIso, status: state.status };
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
    await voidBetsForMatches(db, tournamentId, [...changedByMatchId.keys()]);
  }
}
