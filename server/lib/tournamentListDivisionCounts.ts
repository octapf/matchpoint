import { ObjectId } from 'mongodb';
import { normalizeGroupCount, teamGroupIndex } from '../../lib/tournamentGroups';
import type { TournamentDivision } from '../../types';

export type DivisionCounts3 = { men: number; women: number; mixed: number };

export function zeroDivisionCounts(): DivisionCounts3 {
  return { men: 0, women: 0, mixed: 0 };
}

/** Align tournament id keys between Mongo ObjectId, 24-char hex string, and legacy shapes. */
export function normalizeTournamentIdForStats(tidRaw: unknown): string {
  if (tidRaw == null) return '';
  if (tidRaw instanceof ObjectId) return tidRaw.toString();
  const s = String(tidRaw).trim();
  if (ObjectId.isValid(s) && s.length === 24) return new ObjectId(s).toString();
  return s;
}

export function normalizeTeamDivision(raw: unknown): TournamentDivision {
  if (raw == null || raw === '') return 'mixed';
  const s = String(raw).trim().toLowerCase();
  if (s === 'men' || s === 'women' || s === 'mixed') return s;
  return 'mixed';
}

type TeamRow = {
  tournamentId?: string | ObjectId;
  division?: unknown;
  playerIds?: string[];
  groupIndex?: number;
};

/**
 * Roster stats from `teams`: players = sum of playerIds.length per division; teams = doc count;
 * groups = distinct clamped groupIndex per division. Global totals match sum of divisions.
 */
export function buildDivisionStatsFromTeams(
  teams: TeamRow[],
  groupCountByTournamentId: Map<string, number>
): {
  playersByTid: Map<string, DivisionCounts3>;
  teamsByTid: Map<string, DivisionCounts3>;
  groupsWithTeamsByTid: Map<string, DivisionCounts3>;
  totalPlayersByTid: Map<string, number>;
  totalTeamsByTid: Map<string, number>;
  globalGroupsWithTeamsSet: Map<string, Set<number>>;
} {
  const playersByTid = new Map<string, DivisionCounts3>();
  const teamsByTid = new Map<string, DivisionCounts3>();
  const groupSetsByTidDiv = new Map<string, { men: Set<number>; women: Set<number>; mixed: Set<number> }>();
  const globalGroupsWithTeamsSet = new Map<string, Set<number>>();
  const totalPlayersByTid = new Map<string, number>();
  const totalTeamsByTid = new Map<string, number>();

  for (const row of teams) {
    const tid = normalizeTournamentIdForStats(row.tournamentId);
    if (!tid) continue;

    const div = normalizeTeamDivision(row.division);
    const playerCount = (row.playerIds ?? []).filter(Boolean).length;
    const ngc = groupCountByTournamentId.get(tid) ?? normalizeGroupCount(undefined);
    const gi = teamGroupIndex(row as { groupIndex?: number });
    const clamped = Math.min(ngc - 1, Math.max(0, gi));

    const p = playersByTid.get(tid) ?? zeroDivisionCounts();
    p[div] += playerCount;
    playersByTid.set(tid, p);

    const tc = teamsByTid.get(tid) ?? zeroDivisionCounts();
    tc[div] += 1;
    teamsByTid.set(tid, tc);

    let gsd = groupSetsByTidDiv.get(tid);
    if (!gsd) {
      gsd = { men: new Set(), women: new Set(), mixed: new Set() };
      groupSetsByTidDiv.set(tid, gsd);
    }
    gsd[div].add(clamped);

    let gglob = globalGroupsWithTeamsSet.get(tid);
    if (!gglob) {
      gglob = new Set<number>();
      globalGroupsWithTeamsSet.set(tid, gglob);
    }
    gglob.add(clamped);

    totalPlayersByTid.set(tid, (totalPlayersByTid.get(tid) ?? 0) + playerCount);
    totalTeamsByTid.set(tid, (totalTeamsByTid.get(tid) ?? 0) + 1);
  }

  const groupsWithTeamsByTid = new Map<string, DivisionCounts3>();
  for (const [tid, gsd] of groupSetsByTidDiv) {
    groupsWithTeamsByTid.set(tid, {
      men: gsd.men.size,
      women: gsd.women.size,
      mixed: gsd.mixed.size,
    });
  }

  return {
    playersByTid,
    teamsByTid,
    groupsWithTeamsByTid,
    totalPlayersByTid,
    totalTeamsByTid,
    globalGroupsWithTeamsSet,
  };
}
