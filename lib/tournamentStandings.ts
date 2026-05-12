import type { Match, Team, TournamentCategory } from '@/types';

export type StandingRow = { team: Team; wins: number; points: number; pointsAgainst?: number; pointDiff?: number };

type TeamStat = {
  team: Team;
  wins: number;
  pf: number;
  pa: number;
  pd: number;
};

export function tieBreakOrdinal(seed: string, teamId: string): number {
  const s = `${seed}\0${teamId}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function buildTeamStats(teams: Team[], matches: Match[]): Map<string, TeamStat> {
  const stats = new Map<string, TeamStat>();
  for (const tm of teams) stats.set(tm._id, { team: tm, wins: 0, pf: 0, pa: 0, pd: 0 });

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    if (!m.teamAId || !m.teamBId) continue;
    const sa = stats.get(m.teamAId);
    const sb = stats.get(m.teamBId);
    if (!sa || !sb) continue;

    const pa = Number.isFinite(m.pointsA) ? Math.floor(m.pointsA!) : 0;
    const pb = Number.isFinite(m.pointsB) ? Math.floor(m.pointsB!) : 0;
    sa.pf += pa;
    sa.pa += pb;
    sb.pf += pb;
    sb.pa += pa;

    if (m.winnerId === m.teamAId) sa.wins += 1;
    else if (m.winnerId === m.teamBId) sb.wins += 1;
  }

  for (const s of stats.values()) s.pd = s.pf - s.pa;
  return stats;
}

function internalMiniStats(memberIds: string[], matches: Match[]): Map<string, { wins: number; pf: number; pa: number; pd: number }> {
  const idSet = new Set(memberIds);
  const mini = new Map<string, { wins: number; pf: number; pa: number; pd: number }>();
  for (const id of memberIds) mini.set(id, { wins: 0, pf: 0, pa: 0, pd: 0 });

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

  for (const s of mini.values()) s.pd = s.pf - s.pa;
  return mini;
}

function orderTieGroup(memberIds: string[], matches: Match[], global: Map<string, TeamStat>, tieBreakSeed: string): string[] {
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
    return ga.team.name.localeCompare(gb.team.name);
  });
}

function compareStandingRows(a: StandingRow, b: StandingRow, tieBreakSeed?: string): number {
  if (a.wins !== b.wins) return b.wins - a.wins;
  const pdA = a.pointDiff ?? a.points - (a.pointsAgainst ?? 0);
  const pdB = b.pointDiff ?? b.points - (b.pointsAgainst ?? 0);
  if (pdA !== pdB) return pdB - pdA;
  if (a.points !== b.points) return b.points - a.points;
  if (tieBreakSeed) {
    const oa = tieBreakOrdinal(tieBreakSeed, a.team._id);
    const ob = tieBreakOrdinal(tieBreakSeed, b.team._id);
    if (oa !== ob) return oa < ob ? -1 : 1;
  }
  return a.team.name.localeCompare(b.team.name);
}

export function computeStandingsForGroup(params: {
  teams: Team[];
  matches: Match[];
  /** Tournament id — deterministic draw when sport tie-breakers tie (matches server). */
  tieBreakSeed?: string;
}): StandingRow[] {
  const seed = String(params.tieBreakSeed ?? '');
  const global = buildTeamStats(params.teams, params.matches);
  const winsToMembers = new Map<number, string[]>();
  for (const tm of params.teams) {
    const w = global.get(tm._id)!.wins;
    const list = winsToMembers.get(w) ?? [];
    list.push(tm._id);
    winsToMembers.set(w, list);
  }

  const orderedIds: string[] = [];
  const winLevels = [...winsToMembers.keys()].sort((a, b) => b - a);
  for (const w of winLevels) {
    orderedIds.push(...orderTieGroup(winsToMembers.get(w)!, params.matches, global, seed));
  }

  return orderedIds.map((tid) => {
    const s = global.get(tid)!;
    return {
      team: s.team,
      wins: s.wins,
      points: s.pf,
      pointsAgainst: s.pa,
      pointDiff: s.pd,
    };
  });
}

/** Mirrors server `normalizeFractions` — keeps client preview aligned with `allocateCategoryCounts`. */
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

/** Mirrors server `allocateCategoryCounts` — proportional slots from weights or equal weights fallback. */
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

export function assignCategories(params: {
  standingsByGroup: StandingRow[][];
  categories: TournamentCategory[];
  categoryFractions: Partial<Record<TournamentCategory, number>> | null | undefined;
  /** Same as server: when set and positive sum for active categories, drives allocation (with floor split). */
  categoryCounts?: Partial<Record<TournamentCategory, number>> | null | undefined;
  singleCategoryAdvanceFraction: number | null | undefined;
  tieBreakSeed?: string;
}): {
  teamCategory: Map<string, TournamentCategory>;
  eliminated: Set<string>;
  /** Cross-group snake order (same assignment order as server `assignCategoriesForDivision`). */
  globalOrder: string[];
} {
  const seed = String(params.tieBreakSeed ?? '');
  const groupMax = Math.max(0, ...params.standingsByGroup.map((g) => g.length));

  const global: StandingRow[] = [];
  for (let rank = 0; rank < groupMax; rank++) {
    const bucket: StandingRow[] = [];
    for (const g of params.standingsByGroup) {
      const row = g[rank];
      if (row) bucket.push(row);
    }
    bucket.sort((a, b) => compareStandingRows(a, b, seed));
    global.push(...bucket);
  }

  const cats = params.categories ?? [];
  const teamCategory = new Map<string, TournamentCategory>();
  const eliminated = new Set<string>();

  const globalOrder = global.map((r) => r.team._id);

  if (cats.length === 0) {
    const fRaw = Number(params.singleCategoryAdvanceFraction ?? 0.5);
    const f = Number.isFinite(fRaw) ? Math.max(0, Math.min(1, fRaw)) : 0.5;
    const adv = Math.max(0, Math.min(global.length, Math.ceil(global.length * f)));
    for (let i = 0; i < global.length; i++) {
      const tid = global[i]!.team._id;
      if (i < adv) teamCategory.set(tid, 'Gold');
      else eliminated.add(tid);
    }
    return { teamCategory, eliminated, globalOrder };
  }

  const rawCounts = params.categoryCounts ?? null;
  const sumConfiguredCounts = cats.reduce((acc, c) => {
    const n = Math.floor(Number(rawCounts?.[c] ?? 0));
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const weightsAsFractions: Partial<Record<TournamentCategory, number>> | null =
    sumConfiguredCounts > 0 && rawCounts
      ? (() => {
          const w: Partial<Record<TournamentCategory, number>> = {};
          for (const c of cats) {
            const n = Math.floor(Number(rawCounts[c] ?? 0));
            if (Number.isFinite(n) && n > 0) w[c] = n;
          }
          return Object.keys(w).length ? w : null;
        })()
      : null;

  const counts = allocateCategoryCounts({
    totalTeams: global.length,
    categories: cats,
    fractions: weightsAsFractions ?? params.categoryFractions ?? null,
  });

  let cursor = 0;
  for (const cat of cats) {
    const take = Math.max(0, Math.floor(counts[cat] ?? 0));
    for (let i = 0; i < take && cursor < global.length; i++) {
      teamCategory.set(global[cursor]!.team._id, cat);
      cursor++;
    }
  }
  const last = cats[cats.length - 1]!;
  while (cursor < global.length) {
    teamCategory.set(global[cursor]!.team._id, last);
    cursor++;
  }

  return { teamCategory, eliminated, globalOrder };
}

