import type { TournamentDivision } from '../../types';
import { normalizeGroupCount, splitAcrossDivisions, validateTournamentGroups } from '../../lib/tournamentGroups';

export type TournamentGroupConfig = {
  maxTeams: number;
  groupCountTotal: number;
  teamsPerGroup: number;
  divisions: TournamentDivision[];
  divisionCount: number;
  /** Groups per division (remainder spread to first divisions). */
  groupsPerDivision: (divisionIndex: number) => number;
  divisionGroupOffset: (divisionIndex: number) => number;
  /** Map global groupIndex → division index (0..divisionCount-1). */
  divisionIndexForGroupIndex: (groupIndex: number) => number;
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
  const groupsPerDivision = (divisionIndex: number) =>
    splitAcrossDivisions(vg.groupCount, divisionCount, Math.min(divisionCount - 1, Math.max(0, Math.floor(divisionIndex))));

  const divisionGroupOffset = (divisionIndex: number) => {
    const di = Math.min(divisionCount - 1, Math.max(0, Math.floor(divisionIndex)));
    let offset = 0;
    for (let i = 0; i < di; i++) offset += groupsPerDivision(i);
    return offset;
  };

  const divisionIndexForGroupIndex = (groupIndex: number) => {
    const gi = Math.max(0, Math.floor(groupIndex));
    let cursor = 0;
    for (let di = 0; di < divisionCount; di++) {
      const size = groupsPerDivision(di);
      if (gi < cursor + size) return di;
      cursor += size;
    }
    return Math.max(0, divisionCount - 1);
  };

  return {
    maxTeams,
    groupCountTotal: vg.groupCount,
    teamsPerGroup: vg.teamsPerGroup,
    divisions,
    divisionCount,
    groupsPerDivision,
    divisionGroupOffset,
    divisionIndexForGroupIndex,
  };
}

