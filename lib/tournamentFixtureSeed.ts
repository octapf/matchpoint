import type { Team } from '@/types';

export type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
export type MatchSubTab = 'classification' | MatchCategoryTab;

export function buildSeededClassificationData(params: {
  divisionTeamsByGroup: Team[][];
  matchCategoryTabs: MatchSubTab[];
  pointsToWin: number;
  setsPerMatch: number;
}) {
  const { divisionTeamsByGroup, matchCategoryTabs } = params;
  const pointsToWin = Math.max(1, Math.min(99, Math.floor(params.pointsToWin) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Math.floor(params.setsPerMatch) || 1));
  const setsToWin = Math.floor(setsPerMatch / 2) + 1;
  const categoryCount = Math.max(1, matchCategoryTabs.length - 1);

  return divisionTeamsByGroup.map((groupTeams) => {
    const matches: {
      id: string;
      teamA: Team;
      teamB: Team;
      setsWonA: number;
      setsWonB: number;
      scoreA: number;
      scoreB: number;
      winnerId: string;
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
          winnerId,
        });
      }
    }

    const standings = Object.values(stats).sort(
      (a, b) =>
        b.wins - a.wins ||
        b.points - a.points ||
        a.team.name.localeCompare(b.team.name)
    );

    const categories: Partial<Record<MatchCategoryTab, typeof standings>> = {};
    if (categoryCount > 0) {
      const orderedCats = matchCategoryTabs.filter((x): x is MatchCategoryTab => x !== 'classification');
      let cursor = 0;
      for (let ci = 0; ci < orderedCats.length; ci++) {
        const remaining = standings.length - cursor;
        const slotsLeft = orderedCats.length - ci;
        const size = Math.ceil(remaining / slotsLeft);
        categories[orderedCats[ci]!] = standings.slice(cursor, cursor + size);
        cursor += size;
      }
    }

    return { matches, standings, categories };
  });
}

