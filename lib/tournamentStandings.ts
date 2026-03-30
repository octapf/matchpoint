import type { Match, Team, TournamentCategory } from '@/types';

export type StandingRow = { team: Team; wins: number; points: number };

export function computeStandingsForGroup(params: { teams: Team[]; matches: Match[] }): StandingRow[] {
  const stats: Record<string, StandingRow> = {};
  for (const tm of params.teams) stats[tm._id] = { team: tm, wins: 0, points: 0 };

  for (const m of params.matches) {
    if (m.status !== 'completed') continue;
    if (!m.teamAId || !m.teamBId) continue;
    if (!stats[m.teamAId] || !stats[m.teamBId]) continue;
    stats[m.teamAId]!.points += Number.isFinite(m.pointsA) ? Math.floor(m.pointsA!) : 0;
    stats[m.teamBId]!.points += Number.isFinite(m.pointsB) ? Math.floor(m.pointsB!) : 0;
    if (m.winnerId && stats[m.winnerId]) stats[m.winnerId]!.wins += 1;
  }

  return Object.values(stats).sort(
    (a, b) => b.wins - a.wins || b.points - a.points || a.team.name.localeCompare(b.team.name)
  );
}

export function assignCategories(params: {
  standingsByGroup: StandingRow[][];
  categories: TournamentCategory[];
  categoryFractions: Partial<Record<TournamentCategory, number>> | null | undefined;
  singleCategoryAdvanceFraction: number | null | undefined;
}): { teamCategory: Map<string, TournamentCategory>; eliminated: Set<string> } {
  const groupMax = Math.max(0, ...params.standingsByGroup.map((g) => g.length));

  const global: StandingRow[] = [];
  for (let rank = 0; rank < groupMax; rank++) {
    const bucket: StandingRow[] = [];
    for (const g of params.standingsByGroup) {
      const row = g[rank];
      if (row) bucket.push(row);
    }
    bucket.sort((a, b) => b.wins - a.wins || b.points - a.points || a.team.name.localeCompare(b.team.name));
    global.push(...bucket);
  }

  const cats = params.categories ?? [];
  const teamCategory = new Map<string, TournamentCategory>();
  const eliminated = new Set<string>();

  if (cats.length === 0) {
    const fRaw = Number(params.singleCategoryAdvanceFraction ?? 0.5);
    const f = Number.isFinite(fRaw) ? Math.max(0, Math.min(1, fRaw)) : 0.5;
    const adv = Math.max(0, Math.min(global.length, Math.ceil(global.length * f)));
    for (let i = 0; i < global.length; i++) {
      const tid = global[i]!.team._id;
      if (i < adv) teamCategory.set(tid, 'Gold');
      else eliminated.add(tid);
    }
    return { teamCategory, eliminated };
  }

  const keys: TournamentCategory[] = ['Gold', 'Silver', 'Bronze'];
  const frac = params.categoryFractions ?? null;
  const cleaned: Partial<Record<TournamentCategory, number>> = {};
  for (const k of keys) {
    const v = frac?.[k];
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    cleaned[k] = n;
  }
  const sum = keys.reduce((acc, k) => acc + (cleaned[k] ?? 0), 0);
  const hasConfig = sum > 0;
  const weights = cats.map((c) => (hasConfig ? cleaned[c] ?? 0 : 1));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sumW) * global.length);
  const base = raw.map((x) => Math.floor(x));
  let remaining = global.length - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remaining > 0; k++) {
    base[order[k]!.i] += 1;
    remaining -= 1;
  }

  let cursor = 0;
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i]!;
    const take = Math.max(0, base[i] ?? 0);
    for (let k = 0; k < take && cursor < global.length; k++) {
      teamCategory.set(global[cursor]!.team._id, cat);
      cursor++;
    }
  }
  const last = cats[cats.length - 1]!;
  while (cursor < global.length) {
    teamCategory.set(global[cursor]!.team._id, last);
    cursor++;
  }

  return { teamCategory, eliminated };
}

