import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { knockoutRoundHeadingI18nKey } from '../../lib/knockoutRoundLabel';
import { notifyMany } from './notify';

type TournamentCategoryKey = 'Gold' | 'Silver' | 'Bronze';

const CATEGORY_LABEL_KEY: Record<string, string> = {
  Gold: 'tournaments.categoryGold',
  Silver: 'tournaments.categorySilver',
  Bronze: 'tournaments.categoryBronze',
};

const DIVISION_LABEL_KEY: Record<string, string> = {
  mixed: 'tournaments.divisionMixed',
  men: 'tournaments.divisionMen',
  women: 'tournaments.divisionWomen',
};

function teamCountFromSnapshot(
  tdoc: {
    categoriesSnapshot?: { divisions?: { division: string; categories: { category: string; teamIds: string[] }[] }[] };
  } | null,
  division: string,
  category: string
): number {
  const div = tdoc?.categoriesSnapshot?.divisions?.find((d) => String(d.division) === division);
  const cat = div?.categories?.find((c) => c.category === category);
  return Array.isArray(cat?.teamIds) ? cat.teamIds.length : 0;
}

/**
 * After category bracket generation: tell each player which category / division they play in.
 */
export async function notifyPlayersEnteredCategoryPhase(
  db: Db,
  tournamentId: string,
  tournamentName: string,
  division: string,
  category: TournamentCategoryKey,
  teamIds: string[]
): Promise<void> {
  const catKey = CATEGORY_LABEL_KEY[category];
  const divKey = DIVISION_LABEL_KEY[division];
  if (!catKey || !divKey || teamIds.length === 0) return;

  const teamsCol = db.collection('teams');
  for (const tid of teamIds) {
    if (!ObjectId.isValid(tid)) continue;
    const team = await teamsCol.findOne({ _id: new ObjectId(tid) }, { projection: { playerIds: 1 } });
    const pids = (team as { playerIds?: unknown } | null)?.playerIds;
    const playerIds = Array.isArray(pids) ? pids.map(String).filter(Boolean) : [];
    if (playerIds.length === 0) continue;

    await notifyMany(db, playerIds, {
      type: 'category.entered',
      params: {
        tournament: tournamentName,
        categoryLabelKey: catKey,
        divisionLabelKey: divKey,
      },
      data: { tournamentId },
      dedupeKey: `category.entered:${tournamentId}:${tid}`,
    });
  }
}

/**
 * Winner-only: next knockout round label, or champion when no downstream main-bracket match exists.
 */
export async function notifyCategoryKnockoutAfterMatchCompleted(
  db: Db,
  opts: {
    tournamentId: string;
    tournamentName: string;
    completedMatchId: string;
    division: string;
    category: string;
    isBronzeMatch?: boolean;
    winnerTeamId: string;
  }
): Promise<void> {
  const cat = opts.category;
  if (cat !== 'Gold' && cat !== 'Silver' && cat !== 'Bronze') return;
  if (opts.isBronzeMatch) return;

  const teamsCol = db.collection('teams');
  const winner = await teamsCol.findOne(
    { _id: new ObjectId(opts.winnerTeamId) },
    { projection: { playerIds: 1 } }
  );
  const wp = (winner as { playerIds?: unknown } | null)?.playerIds;
  const playerIds = Array.isArray(wp) ? wp.map(String).filter(Boolean) : [];
  if (playerIds.length === 0) return;

  const matchesCol = db.collection('matches');
  const tdoc = await db
    .collection('tournaments')
    .findOne({ _id: new ObjectId(opts.tournamentId) }, { projection: { categoriesSnapshot: 1 } });

  const teamCount = teamCountFromSnapshot(tdoc as Parameters<typeof teamCountFromSnapshot>[0], opts.division, cat);
  if (teamCount < 2) return;

  const mainSiblings = await matchesCol
    .find(
      {
        tournamentId: opts.tournamentId,
        stage: 'category',
        division: opts.division,
        category: cat,
        isBronzeMatch: { $ne: true },
      },
      { projection: { bracketRound: 1 } }
    )
    .toArray();

  const sortedRounds = [
    ...new Set(
      mainSiblings
        .map((m) => Number((m as { bracketRound?: unknown }).bracketRound ?? 0))
        .filter((r) => r > 0)
    ),
  ].sort((a, b) => a - b);
  const mainRoundCount = sortedRounds.length;
  if (sortedRounds.length === 0) return;

  const winnerDownstream = await matchesCol
    .find(
      {
        tournamentId: opts.tournamentId,
        stage: 'category',
        division: opts.division,
        category: cat,
        isBronzeMatch: { $ne: true },
        $or: [
          { advanceTeamAFromMatchId: opts.completedMatchId },
          { advanceTeamBFromMatchId: opts.completedMatchId },
        ],
      },
      { projection: { bracketRound: 1 } }
    )
    .toArray();

  const catKey = CATEGORY_LABEL_KEY[cat];
  const divKey = DIVISION_LABEL_KEY[opts.division] ?? 'tournaments.divisionMixed';

  if (winnerDownstream.length === 0) {
    await notifyMany(db, playerIds, {
      type: 'category.tournamentWon',
      params: {
        tournament: opts.tournamentName,
        categoryLabelKey: catKey,
        divisionLabelKey: divKey,
      },
      data: { tournamentId: opts.tournamentId, matchId: opts.completedMatchId },
      dedupeKey: `category.tournamentWon:${opts.tournamentId}:${cat}:${opts.division}:${opts.winnerTeamId}`,
    });
    return;
  }

  const consumer = winnerDownstream[0] as { bracketRound?: number };
  const br = Number(consumer.bracketRound ?? 0);
  const idx = sortedRounds.indexOf(br);
  if (idx < 0) return;
  const roundIndexFromEnd = sortedRounds.length - 1 - idx;
  const label = knockoutRoundHeadingI18nKey(roundIndexFromEnd, br, teamCount, mainRoundCount);
  const params: Record<string, string | number> = {
    tournament: opts.tournamentName,
    nextRoundKey: label.key,
  };
  if (label.n != null) params.nextRoundN = label.n;

  await notifyMany(db, playerIds, {
    type: 'category.roundAdvanced',
    params,
    data: { tournamentId: opts.tournamentId, matchId: opts.completedMatchId },
    dedupeKey: `category.roundAdvanced:${opts.completedMatchId}:${opts.winnerTeamId}`,
  });
}
