import type { Team } from '@/types';
import type { BracketMatchRow } from '@/components/tournament/detail/CategoryBracketDiagram';
import type { CategoryKnockoutMatchPlan } from '@/lib/singleElimBracket';
import { planCategorySingleElimination } from '@/lib/singleElimBracket';
import { resolveTeamForFixture } from '@/lib/tournamentMatchDisplay';

export type FixtureCategoryMatchRow = {
  id: string;
  teamA: Team;
  teamB: Team;
  pointsA: number;
  pointsB: number;
  winnerId: string;
  status?: 'scheduled' | 'in_progress' | 'paused' | 'completed';
  bracketRound?: number;
  isBronzeMatch?: boolean;
  orderIndex?: number;
  advanceTeamAFromMatchId?: string;
  advanceTeamBFromMatchId?: string;
  advanceTeamALoserFromMatchId?: string;
  advanceTeamBLoserFromMatchId?: string;
};

function pairKey(a: string, b: string): string {
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  return `${x}\0${y}`;
}

/** Insertion order — must match classification seed order, not alphabetical sort. */
function uniqueTeamIdsFromRows(rows: FixtureCategoryMatchRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of rows) {
    for (const tid of [String(m.teamA._id ?? '').trim(), String(m.teamB._id ?? '').trim()]) {
      if (tid && !seen.has(tid)) {
        seen.add(tid);
        out.push(tid);
      }
    }
  }
  return out;
}

/** Synthetic display-only ids: not persisted matches; do not open detail screen. */
export function isSyntheticBracketMatchId(id: string): boolean {
  return id.startsWith('bracket-plan-');
}

function tbdTeam(tournamentId: string, tbdLabel: string, teamById: Record<string, Team>): Team {
  return resolveTeamForFixture(undefined, teamById, tournamentId, tbdLabel);
}

function winnerFromResolvedRow(
  row: BracketMatchRow | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): Team {
  if (!row) return tbdTeam(tournamentId, tbdLabel, teamById);
  if (row.status !== 'completed' || !String(row.winnerId ?? '').trim()) {
    return tbdTeam(tournamentId, tbdLabel, teamById);
  }
  const wid = String(row.winnerId).trim();
  const aid = String(row.teamA._id ?? '').trim();
  const bid = String(row.teamB._id ?? '').trim();
  if (wid === aid) return row.teamA;
  if (wid === bid) return row.teamB;
  return resolveTeamForFixture(wid, teamById, tournamentId, tbdLabel);
}

function loserFromResolvedRow(
  row: BracketMatchRow | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): Team {
  if (!row) return tbdTeam(tournamentId, tbdLabel, teamById);
  if (row.status !== 'completed' || !String(row.winnerId ?? '').trim()) {
    return tbdTeam(tournamentId, tbdLabel, teamById);
  }
  const wid = String(row.winnerId).trim();
  const aid = String(row.teamA._id ?? '').trim();
  const bid = String(row.teamB._id ?? '').trim();
  if (wid === aid) return row.teamB;
  if (wid === bid) return row.teamA;
  return tbdTeam(tournamentId, tbdLabel, teamById);
}

/**
 * Direct seed slot: trust plan id; use live only when its side matches the plan id (avoids wrong API rows).
 */
function directSideFromPlan(
  planId: string | undefined,
  side: 'A' | 'B',
  live: FixtureCategoryMatchRow | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): Team {
  const pid = String(planId ?? '').trim();
  if (!pid) return tbdTeam(tournamentId, tbdLabel, teamById);
  if (live) {
    const t = side === 'A' ? live.teamA : live.teamB;
    const tid = String(t._id ?? '').trim();
    if (tid === pid) return t;
  }
  return resolveTeamForFixture(pid, teamById, tournamentId, tbdLabel);
}

function resolveSideForPlan(
  p: CategoryKnockoutMatchPlan,
  side: 'A' | 'B',
  resolved: BracketMatchRow[],
  live: FixtureCategoryMatchRow | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): Team {
  const loserIdx =
    side === 'A' ? p.advanceTeamALoserFromPlanIndex : p.advanceTeamBLoserFromPlanIndex;
  const winnerIdx =
    side === 'A' ? p.advanceTeamAFromPlanIndex : p.advanceTeamBFromPlanIndex;
  const directId = side === 'A' ? p.teamAId : p.teamBId;

  if (typeof loserIdx === 'number') {
    return loserFromResolvedRow(resolved[loserIdx], teamById, tournamentId, tbdLabel);
  }
  if (typeof winnerIdx === 'number') {
    return winnerFromResolvedRow(resolved[winnerIdx], teamById, tournamentId, tbdLabel);
  }
  return directSideFromPlan(directId, side, live, teamById, tournamentId, tbdLabel);
}

/**
 * Always builds the full single-elim tree (same as server `planCategorySingleElimination`) and
 * merges API rows by `orderIndex` (= plan index) or pair of teams. This keeps every round in the
 * diagram so connector lines align; using raw API rows alone can drop early rounds or break columns.
 *
 * Teams in slots fed by earlier matches are derived only when the feeder is completed (winner/loser);
 * otherwise the label is TBD — never trust stale team names from the API for future rounds.
 */
export function buildBracketRowsForCategory(
  catRows: FixtureCategoryMatchRow[],
  snapshotTeamIds: string[] | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): BracketMatchRow[] {
  if (catRows.length === 0) return [];

  const teamIds =
    snapshotTeamIds && snapshotTeamIds.filter(Boolean).length >= 2
      ? snapshotTeamIds.map(String).filter(Boolean)
      : uniqueTeamIdsFromRows(catRows);
  if (teamIds.length < 2) return catRows.map((r) => ({ ...r })) as BracketMatchRow[];

  const plans = planCategorySingleElimination(teamIds);
  if (plans.length === 0) return catRows.map((r) => ({ ...r })) as BracketMatchRow[];

  /** First row wins if server sends duplicate orderIndex (avoid wrong overwrite). */
  const byOrderIndex = new Map<number, FixtureCategoryMatchRow>();
  for (const m of catRows) {
    const oi = typeof m.orderIndex === 'number' ? m.orderIndex : -1;
    if (oi >= 0 && !byOrderIndex.has(oi)) byOrderIndex.set(oi, m);
  }

  const byPair = new Map<string, FixtureCategoryMatchRow>();
  for (const m of catRows) {
    const a = String(m.teamA._id ?? '').trim();
    const b = String(m.teamB._id ?? '').trim();
    if (a && b) byPair.set(pairKey(a, b), m);
  }

  const idByPlanIndex = new Map<number, string>();
  const liveForPi: (FixtureCategoryMatchRow | undefined)[] = [];

  for (let pi = 0; pi < plans.length; pi++) {
    const p = plans[pi]!;
    const tidA = String(p.teamAId ?? '').trim();
    const tidB = String(p.teamBId ?? '').trim();

    /** Pair (seed matchup) before orderIndex so wrong/missing indices do not attach the wrong match. */
    let live: FixtureCategoryMatchRow | undefined;
    if (tidA && tidB) {
      live = byPair.get(pairKey(tidA, tidB));
      if (!live) {
        live = catRows.find(
          (m) =>
            String(m.teamA._id ?? '').trim() === tidA && String(m.teamB._id ?? '').trim() === tidB
        );
      }
    }
    if (!live) live = byOrderIndex.get(pi);

    liveForPi[pi] = live;
    idByPlanIndex.set(pi, live?.id ?? `bracket-plan-${pi}`);
  }

  const resolved: BracketMatchRow[] = [];

  for (let pi = 0; pi < plans.length; pi++) {
    const p = plans[pi]!;
    const live = liveForPi[pi];

    const teamA = resolveSideForPlan(p, 'A', resolved, live, teamById, tournamentId, tbdLabel);
    const teamB = resolveSideForPlan(p, 'B', resolved, live, teamById, tournamentId, tbdLabel);

    const rowId = live?.id ?? `bracket-plan-${pi}`;

    const advA = p.advanceTeamAFromPlanIndex != null ? idByPlanIndex.get(p.advanceTeamAFromPlanIndex) : undefined;
    const advB = p.advanceTeamBFromPlanIndex != null ? idByPlanIndex.get(p.advanceTeamBFromPlanIndex) : undefined;
    const advAL = p.advanceTeamALoserFromPlanIndex != null ? idByPlanIndex.get(p.advanceTeamALoserFromPlanIndex) : undefined;
    const advBL = p.advanceTeamBLoserFromPlanIndex != null ? idByPlanIndex.get(p.advanceTeamBLoserFromPlanIndex) : undefined;

    resolved.push({
      id: rowId,
      teamA,
      teamB,
      pointsA: live?.pointsA ?? 0,
      pointsB: live?.pointsB ?? 0,
      winnerId: live?.winnerId ?? '',
      status: live?.status ?? 'scheduled',
      bracketRound: p.bracketRound,
      orderIndex: pi,
      isBronzeMatch: !!p.isBronze,
      advanceTeamAFromMatchId: advA,
      advanceTeamBFromMatchId: advB,
      advanceTeamALoserFromMatchId: advAL,
      advanceTeamBLoserFromMatchId: advBL,
    });
  }

  return resolved as BracketMatchRow[];
}
