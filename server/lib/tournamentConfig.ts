import type { TournamentDivision } from '../../types';
import { normalizeGroupCount, validateTournamentGroups } from '../../lib/tournamentGroups';

export type TournamentGroupConfig = {
  maxTeams: number;
  groupCountTotal: number;
  teamsPerGroup: number;
  divisions: TournamentDivision[];
  divisionCount: number;
  groupsPerDivision: number;
  divisionGroupOffset: (divisionIndex: number) => number;
};

export function parseDivisions(raw: unknown): TournamentDivision[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: TournamentDivision[] = [];
  for (const x of arr) {
    const s = typeof x === 'string' ? x.trim() : '';
    if (s === 'men' || s === 'women' || s === 'mixed') {
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

export function deriveTournamentGroupConfig(doc: { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown }): TournamentGroupConfig {
  const maxTeams = Math.floor(Number(doc.maxTeams ?? 16));
  const groupCountTotal = normalizeGroupCount(doc.groupCount);
  const vg = validateTournamentGroups(maxTeams, groupCountTotal);
  if (!vg.ok) {
    throw new Error('Invalid tournament group configuration');
  }
  const divisions = parseDivisions(doc.divisions);
  const divisionCount = Math.max(1, divisions.length || 1);
  const groupsPerDivision =
    divisionCount > 1 && vg.groupCount % divisionCount === 0 ? vg.groupCount / divisionCount : vg.groupCount;

  return {
    maxTeams,
    groupCountTotal: vg.groupCount,
    teamsPerGroup: vg.teamsPerGroup,
    divisions,
    divisionCount,
    groupsPerDivision,
    divisionGroupOffset: (divisionIndex: number) => {
      const di = Math.min(divisionCount - 1, Math.max(0, Math.floor(divisionIndex)));
      return di * groupsPerDivision;
    },
  };
}

