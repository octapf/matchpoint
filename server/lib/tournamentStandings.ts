import type { TournamentCategory } from '../../types';

export type StandingRow = {
  teamId: string;
  teamName: string;
  wins: number;
  /** Rally points scored (points for). */
  points: number;
  pointsAgainst?: number;
  pointDiff?: number;
};

type TeamStat = {
  teamId: string;
  teamName: string;
  wins: number;
  pf: number;
  pa: number;
  pd: number;
};

type MatchLike = {
  status?: string;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  pointsA?: number;
  pointsB?: number;
};

/** Fair, deterministic “coin flip” when sport stats tie (no organizer step). Same seed + team → same order always. */
function tieBreakOrdinal(seed: string, teamId: string): number {
  const s = `${seed}\0${teamId}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function buildTeamStats(teams: { _id: string; name: string }[], matches: MatchLike[]): Map<string, TeamStat> {
  const stats = new Map<string, TeamStat>();
  for (const tm of teams) {
    stats.set(tm._id, { teamId: tm._id, teamName: tm.name, wins: 0, pf: 0, pa: 0, pd: 0 });
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const a = String(m.teamAId ?? '');
    const b = String(m.teamBId ?? '');
    if (!a || !b) continue;
    if (!stats.has(a) || !stats.has(b)) continue;

    const pa = Number.isFinite(m.pointsA) ? Math.floor(m.pointsA!) : 0;
    const pb = Number.isFinite(m.pointsB) ? Math.floor(m.pointsB!) : 0;
    const sa = stats.get(a)!;
    const sb = stats.get(b)!;
    sa.pf += pa;
    sa.pa += pb;
    sb.pf += pb;
    sb.pa += pa;

    const w = String(m.winnerId ?? '');
    if (w === a) sa.wins += 1;
    else if (w === b) sb.wins += 1;
  }

  for (const s of stats.values()) {
    s.pd = s.pf - s.pa;
  }
  return stats;
}

function internalMiniStats(memberIds: string[], matches: MatchLike[]): Map<string, { wins: number; pf: number; pa: number; pd: number }> {
  const idSet = new Set(memberIds);
  const mini = new Map<string, { wins: number; pf: number; pa: number; pd: number }>();
  for (const id of memberIds) {
    mini.set(id, { wins: 0, pf: 0, pa: 0, pd: 0 });
  }
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const a = String(m.teamAId ?? '');
    const b = String(m.teamBId ?? '');
    if (!idSet.has(a) || !idSet.has(b)) continue;
    const pa = Number.isFinite(m.pointsA) ? Math.floor(m.pointsA!) : 0;
    const pb = Number.isFinite(m.pointsB) ? Math.floor(m.pointsB!) : 0;
    const sa = mini.get(a)!;
    const sb = mini.get(b)!;
    sa.pf += pa;
    sa.pa += pb;
    sb.pf += pb;
    sb.pa += pa;
    const w = String(m.winnerId ?? '');
    if (w === a) sa.wins += 1;
    else if (w === b) sb.wins += 1;
  }
  for (const s of mini.values()) {
    s.pd = s.pf - s.pa;
  }
  return mini;
}

function orderTieGroup(
  memberIds: string[],
  matches: MatchLike[],
  global: Map<string, TeamStat>,
  tieBreakSeed: string
): string[] {
  if (memberIds.length <= 1) return [...memberIds];
  const mini = internalMiniStats(memberIds, matches);
  return [...memberIds].sort((ia, ib) => {
    const a = mini.get(ia)!;
    const b = mini.get(ib)!;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.pd !== b.pd) return b.pd - a.pd;
    if (a.pf !== b.pf) return b.pf - a.pf;
    const ga = global.get(ia)!;
    const gb = global.get(ib)!;
    if (ga.pd !== gb.pd) return gb.pd - ga.pd;
    if (ga.pf !== gb.pf) return gb.pf - ga.pf;
    if (tieBreakSeed) {
      const oa = tieBreakOrdinal(tieBreakSeed, ia);
      const ob = tieBreakOrdinal(tieBreakSeed, ib);
      if (oa !== ob) return oa < ob ? -1 : 1;
    }
    return ga.teamName.localeCompare(gb.teamName);
  });
}

export function compareStandingRowCrossGroup(a: StandingRow, b: StandingRow, tieBreakSeed?: string): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  const pdA = a.pointDiff ?? a.points - (a.pointsAgainst ?? 0);
  const pdB = b.pointDiff ?? b.points - (b.pointsAgainst ?? 0);
  if (pdA !== pdB) return pdB - pdA;
  if (a.points !== b.points) return b.points - a.points;
  if (tieBreakSeed) {
    const oa = tieBreakOrdinal(tieBreakSeed, a.teamId);
    const ob = tieBreakOrdinal(tieBreakSeed, b.teamId);
    if (oa !== ob) return oa < ob ? -1 : 1;
  }
  return a.teamName.localeCompare(b.teamName);
}

export function computeStandingsForGroup(params: {
  teams: { _id: string; name: string }[];
  matches: MatchLike[];
  /**
   * Usually the tournament id. When set, unbreakable ties use a deterministic draw (no organizer).
   * When omitted, ties fall back to team name (legacy).
   */
  tieBreakSeed?: string;
}): StandingRow[] {
  const tieBreakSeed = String(params.tieBreakSeed ?? '');
  const global = buildTeamStats(params.teams, params.matches);
  const teamIds = params.teams.map((t) => t._id);
  const winsToMembers = new Map<number, string[]>();
  for (const tid of teamIds) {
    const w = global.get(tid)!.wins;
    const list = winsToMembers.get(w) ?? [];
    list.push(tid);
    winsToMembers.set(w, list);
  }

  const winLevels = [...winsToMembers.keys()].sort((x, y) => y - x);
  const orderedIds: string[] = [];
  for (const w of winLevels) {
    const members = winsToMembers.get(w)!;
    orderedIds.push(...orderTieGroup(members, params.matches, global, tieBreakSeed));
  }

  return orderedIds.map((tid) => {
    const s = global.get(tid)!;
    return {
      teamId: s.teamId,
      teamName: s.teamName,
      wins: s.wins,
      points: s.pf,
      pointsAgainst: s.pa,
      pointDiff: s.pd,
    };
  });
}

export function normalizeFractions(
  fractions: Partial<Record<TournamentCategory, number>> | null | undefined
): Partial<Record<TournamentCategory, number>> | null {
  if (!fractions) return null;
  const keys: TournamentCategory[] = ['Gold', 'Silver', 'Bronze'];
  const cleaned: Partial<Record<TournamentCategory, number>> = {};
  for (const k of keys) {
    const v = fractions[k];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    cleaned[k] = n;
  }
  const sum = keys.reduce((acc, k) => acc + (cleaned[k] ?? 0), 0);
  if (sum <= 0) return null;
  const out: Partial<Record<TournamentCategory, number>> = {};
  for (const k of keys) {
    const v = cleaned[k] ?? 0;
    if (v <= 0) continue;
    out[k] = v / sum;
  }
  return out;
}

export function allocateCategoryCounts(params: {
  totalTeams: number;
  categories: TournamentCategory[];
  fractions: Partial<Record<TournamentCategory, number>> | null;
}): Record<TournamentCategory, number> {
  const total = Math.max(0, Math.floor(params.totalTeams));
  const cats = params.categories.length ? params.categories : (['Gold'] as TournamentCategory[]);
  const frac = normalizeFractions(params.fractions);

  const weights = cats.map((c) => frac?.[c] ?? (frac ? 0 : 1));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const norm = weights.map((w) => w / sumW);

  const raw = norm.map((w) => w * total);
  const base = raw.map((x) => Math.floor(x));
  let used = base.reduce((a, b) => a + b, 0);
  let remaining = total - used;

  const remainderOrder = (['Gold', 'Silver', 'Bronze'] as TournamentCategory[]).filter((c) => cats.includes(c));
  for (let r = 0; r < remaining; r++) {
    const cat = remainderOrder[r % remainderOrder.length]!;
    const idx = cats.indexOf(cat);
    if (idx >= 0) base[idx] = (base[idx] ?? 0) + 1;
  }

  const out: Record<TournamentCategory, number> = { Gold: 0, Silver: 0, Bronze: 0 };
  for (let i = 0; i < cats.length; i++) out[cats[i]!] = base[i] ?? 0;
  return out;
}

export function assignCategoriesForDivision(params: {
  standingsByGroup: StandingRow[][];
  categories: TournamentCategory[];
  categoryFractions: Partial<Record<TournamentCategory, number>> | null;
  singleCategoryAdvanceFraction: number;
  /** Same as computeStandingsForGroup.tieBreakSeed — deterministic draw among tied cross-group rows. */
  tieBreakSeed?: string;
}): { teamCategory: Map<string, TournamentCategory>; eliminated: Set<string>; globalOrder: string[] } {
  const tieBreakSeed = params.tieBreakSeed;
  const groupMax = Math.max(0, ...params.standingsByGroup.map((g) => g.length));

  const global: StandingRow[] = [];
  for (let rank = 0; rank < groupMax; rank++) {
    const bucket: StandingRow[] = [];
    for (const g of params.standingsByGroup) {
      const row = g[rank];
      if (row) bucket.push(row);
    }
    bucket.sort((a, b) => compareStandingRowCrossGroup(a, b, tieBreakSeed));
    global.push(...bucket);
  }

  const globalOrder = global.map((r) => r.teamId);

  const teamCategory = new Map<string, TournamentCategory>();
  const eliminated = new Set<string>();

  if (params.categories.length <= 0) {
    const f = Number.isFinite(params.singleCategoryAdvanceFraction)
      ? Math.max(0, Math.min(1, params.singleCategoryAdvanceFraction))
      : 0.5;
    const adv = Math.max(0, Math.min(global.length, Math.ceil(global.length * f)));
    for (let i = 0; i < global.length; i++) {
      const tid = global[i]!.teamId;
      if (i < adv) teamCategory.set(tid, 'Gold');
      else eliminated.add(tid);
    }
    return { teamCategory, eliminated, globalOrder };
  }

  const counts = allocateCategoryCounts({
    totalTeams: global.length,
    categories: params.categories,
    fractions: params.categoryFractions,
  });

  let cursor = 0;
  for (const cat of params.categories) {
    const take = Math.max(0, Math.floor(counts[cat] ?? 0));
    for (let i = 0; i < take && cursor < global.length; i++) {
      teamCategory.set(global[cursor]!.teamId, cat);
      cursor++;
    }
  }
  const last = params.categories[params.categories.length - 1]!;
  while (cursor < global.length) {
    teamCategory.set(global[cursor]!.teamId, last);
    cursor++;
  }

  return { teamCategory, eliminated, globalOrder };
}
