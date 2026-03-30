import type { TournamentCategory } from '../../types';

export type StandingRow = {
  teamId: string;
  teamName: string;
  wins: number;
  points: number;
};

export function computeStandingsForGroup(params: {
  teams: { _id: string; name: string }[];
  matches: Array<{
    status?: string;
    teamAId?: string;
    teamBId?: string;
    winnerId?: string;
    pointsA?: number;
    pointsB?: number;
  }>;
}): StandingRow[] {
  const stats = new Map<string, StandingRow>();
  for (const tm of params.teams) {
    stats.set(tm._id, { teamId: tm._id, teamName: tm.name, wins: 0, points: 0 });
  }

  for (const m of params.matches) {
    if (m.status !== 'completed') continue;
    const a = String(m.teamAId ?? '');
    const b = String(m.teamBId ?? '');
    if (!a || !b) continue;
    if (!stats.has(a) || !stats.has(b)) continue;

    const pa = Number.isFinite(m.pointsA) ? Math.floor(m.pointsA!) : 0;
    const pb = Number.isFinite(m.pointsB) ? Math.floor(m.pointsB!) : 0;
    stats.get(a)!.points += pa;
    stats.get(b)!.points += pb;

    const w = String(m.winnerId ?? '');
    if (w && stats.has(w)) stats.get(w)!.wins += 1;
  }

  return Array.from(stats.values()).sort(
    (x, y) => y.wins - x.wins || y.points - x.points || x.teamName.localeCompare(y.teamName)
  );
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

  // Default equal split if not configured.
  const weights = cats.map((c) => frac?.[c] ?? (frac ? 0 : 1));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const norm = weights.map((w) => w / sumW);

  const raw = norm.map((w) => w * total);
  const base = raw.map((x) => Math.floor(x));
  let used = base.reduce((a, b) => a + b, 0);
  let remaining = total - used;

  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remaining > 0; k++) {
    base[order[k]!.i] += 1;
    remaining -= 1;
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
}): { teamCategory: Map<string, TournamentCategory>; eliminated: Set<string> } {
  const groupMax = Math.max(0, ...params.standingsByGroup.map((g) => g.length));

  // Global ranking: interleave by group rank so group winners are compared first.
  const global: StandingRow[] = [];
  for (let rank = 0; rank < groupMax; rank++) {
    const bucket: StandingRow[] = [];
    for (const g of params.standingsByGroup) {
      const row = g[rank];
      if (row) bucket.push(row);
    }
    bucket.sort((a, b) => b.wins - a.wins || b.points - a.points || a.teamName.localeCompare(b.teamName));
    global.push(...bucket);
  }

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
    return { teamCategory, eliminated };
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
  // Any remainder (e.g., 0 weights) goes to last category.
  const last = params.categories[params.categories.length - 1]!;
  while (cursor < global.length) {
    teamCategory.set(global[cursor]!.teamId, last);
    cursor++;
  }

  return { teamCategory, eliminated };
}

