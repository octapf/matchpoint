import type { Entry, Team, TournamentDivision, User } from '@/types';

export type DivisionTab = TournamentDivision;

export function divisionForPair(g1?: string, g2?: string): DivisionTab {
  if (g1 === 'male' && g2 === 'male') return 'men';
  if (g1 === 'female' && g2 === 'female') return 'women';
  // Mixed for any combination / unknown.
  return 'mixed';
}

export function divisionForTeam(team: Team, userMap: Record<string, User>): DivisionTab {
  const p1 = userMap[team.playerIds?.[0] ?? ''];
  const p2 = userMap[team.playerIds?.[1] ?? ''];
  return divisionForPair(p1?.gender, p2?.gender);
}

export function divisionForEntry(entry: Entry, userMap: Record<string, User>, teamDivisionById: Record<string, DivisionTab>): DivisionTab | null {
  if (entry.teamId && teamDivisionById[entry.teamId]) return teamDivisionById[entry.teamId]!;
  const g = userMap[entry.userId]?.gender;
  if (g === 'male') return 'men';
  if (g === 'female') return 'women';
  return null;
}

