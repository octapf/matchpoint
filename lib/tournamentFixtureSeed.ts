import type { Team } from '@/types';

import { assignCategories } from '@/lib/tournamentStandings';

export type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
export type MatchSubTab = 'live' | 'classification' | MatchCategoryTab;

export function buildSeededClassificationData(params: {
  divisionTeamsByGroup: Team[][];
  matchCategoryTabs: MatchSubTab[];
  pointsToWin: number;
  setsPerMatch: number;
  categoryFractions?: Partial<Record<MatchCategoryTab, number>> | null;
  singleCategoryAdvanceFraction?: number | null;
}) {
  const { divisionTeamsByGroup, matchCategoryTabs } = params;
  const pointsToWin = Math.max(1, Math.min(99, Math.floor(params.pointsToWin) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Math.floor(params.setsPerMatch) || 1));
  const setsToWin = Math.floor(setsPerMatch / 2) + 1;
  const orderedCats = matchCategoryTabs.filter(
    (x): x is MatchCategoryTab => x === 'Gold' || x === 'Silver' || x === 'Bronze'
  );

  const perGroup = divisionTeamsByGroup.map((groupTeams) => {
    const matches: {
      id: string;
      teamA: Team;
      teamB: Team;
      setsWonA: number;
      setsWonB: number;
      scoreA: number;
      scoreB: number;
      pointsA: number;
      pointsB: number;
      winnerId: string;
      status: 'completed';
    }[] = [];

    const stats: Record<string, { team: Team; wins: number; points: number }> = {};
    for (const team of groupTeams) {
      stats[team._id] = { team, wins: 0, points: 0 };
    }

    for (let i = 0; i < groupTeams.length; i++) {
      for (let j = i + 1; j < groupTeams.length; j++) {
        const teamA = groupTeams[i]!;
        const teamB = groupTeams[j]!;
        const seedA = teamA._id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const seedB = teamB._id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        let setsWonA = 0;
        let setsWonB = 0;
        let scoreA = 0;
        let scoreB = 0;
        let lastSetA = 0;
        let lastSetB = 0;
        for (let setIdx = 0; setIdx < setsPerMatch; setIdx++) {
          if (setsWonA >= setsToWin || setsWonB >= setsToWin) break;
          const baseA = (seedA + seedB + i + j + setIdx * 3) % 10;
          const baseB = (seedA * 3 + seedB + i + j + setIdx * 5) % 10;
          let setA = Math.max(0, pointsToWin - 3 + baseA);
          let setB = Math.max(0, pointsToWin - 3 + baseB);
          if (setA === setB) setA += 1;
          if (setA > setB) setsWonA += 1;
          else setsWonB += 1;
          scoreA += setA;
          scoreB += setB;
          lastSetA = setA;
          lastSetB = setB;
        }

        const winnerId = setsWonA > setsWonB ? teamA._id : teamB._id;
        stats[teamA._id]!.points += scoreA;
        stats[teamB._id]!.points += scoreB;
        stats[winnerId]!.wins += 1;
        matches.push({
          id: `${teamA._id}-${teamB._id}`,
          teamA,
          teamB,
          setsWonA,
          setsWonB,
          scoreA,
          scoreB,
          pointsA: lastSetA,
          pointsB: lastSetB,
          winnerId,
          status: 'completed',
        });
      }
    }

    const standings = Object.values(stats).sort(
      (a, b) =>
        b.wins - a.wins ||
        b.points - a.points ||
        a.team.name.localeCompare(b.team.name)
    );

    return { matches, standings };
  });

  const standingsByGroup = perGroup.map((p) => p.standings);
  const { teamCategory, eliminated } = assignCategories({
    standingsByGroup,
    categories: orderedCats,
    categoryFractions: params.categoryFractions ?? null,
    singleCategoryAdvanceFraction: params.singleCategoryAdvanceFraction ?? 0.5,
  });

  const perGroupWithCategories = perGroup.map(({ matches, standings }) => {
    const categories: Partial<Record<MatchCategoryTab, typeof standings>> = {};
    for (const cat of orderedCats) {
      categories[cat] = standings.filter((row) => teamCategory.get(row.team._id) === cat);
    }
    return { matches, standings, categories };
  });

  return {
    perGroup: perGroupWithCategories,
    teamCategory,
    eliminated,
  };
}

