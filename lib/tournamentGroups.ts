/**
 * Tournament groups: teams are split into N groups (min 2, default 4).
 * maxTeams must be divisible by groupCount so each group has the same capacity.
 * Each group must allow at least MIN_TEAMS_PER_GROUP teams (default capacity is DEFAULT_TEAMS_PER_GROUP).
 */

export const DEFAULT_GROUP_COUNT = 4;
export const MIN_GROUP_COUNT = 2;
export const MAX_GROUP_COUNT = 32;
/** Minimum teams that must fit in each group (maxTeams ÷ groupCount). */
export const MIN_TEAMS_PER_GROUP = 2;
/** Default capacity per group when organizers use typical defaults (e.g. 4 groups × 4 = 16 teams). */
export const DEFAULT_TEAMS_PER_GROUP = 4;

/** Max player entries (one entry = one player); doubles ⇒ 2 × max teams. */
export function maxPlayerSlotsForTournament(maxTeams: number): number {
  const mt = Math.floor(Number(maxTeams));
  if (!Number.isFinite(mt) || mt < 2) return 32;
  return mt * 2;
}

export function normalizeGroupCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < MIN_GROUP_COUNT) return DEFAULT_GROUP_COUNT;
  return Math.min(MAX_GROUP_COUNT, Math.floor(n));
}

/**
 * All valid group counts for `maxTeams`: divisors in [MIN_GROUP_COUNT, MAX_GROUP_COUNT]
 * with (maxTeams ÷ gc) ≥ MIN_TEAMS_PER_GROUP.
 */
export function getValidGroupCountsForMaxTeams(maxTeams: number): number[] {
  const mt = Math.floor(Number(maxTeams));
  if (!Number.isFinite(mt) || mt < 2) return [];
  const out: number[] = [];
  for (let gc = MIN_GROUP_COUNT; gc <= Math.min(MAX_GROUP_COUNT, mt); gc++) {
    if (mt % gc !== 0) continue;
    const teamsPerGroup = mt / gc;
    if (teamsPerGroup < MIN_TEAMS_PER_GROUP) continue;
    out.push(gc);
  }
  return out;
}

/** When `previous` is not valid for `maxTeams`, pick the closest valid count. If none exist, returns `previous`. */
export function pickGroupCountForMaxTeams(maxTeams: number, previous: number): number {
  const valid = getValidGroupCountsForMaxTeams(maxTeams);
  if (valid.length === 0) return previous;
  if (valid.includes(previous)) return previous;
  let best = valid[0]!;
  let bestDist = Math.abs(best - previous);
  for (const v of valid) {
    const d = Math.abs(v - previous);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

export function validateTournamentGroups(
  maxTeams: number,
  groupCount: number
):
  | { ok: true; teamsPerGroup: number; groupCount: number }
  | { ok: false; reason: 'divisible' | 'minTeams' | 'minPerGroup' } {
  const mt = Math.floor(Number(maxTeams));
  if (!Number.isFinite(mt) || mt < 2) return { ok: false, reason: 'minTeams' };
  const gc = Math.max(MIN_GROUP_COUNT, Math.min(MAX_GROUP_COUNT, Math.floor(groupCount)));
  if (mt % gc !== 0) return { ok: false, reason: 'divisible' };
  const teamsPerGroup = mt / gc;
  if (teamsPerGroup < 1) return { ok: false, reason: 'divisible' };
  if (teamsPerGroup < MIN_TEAMS_PER_GROUP) return { ok: false, reason: 'minPerGroup' };
  return { ok: true, teamsPerGroup, groupCount: gc };
}

/** Effective group index for a team doc (legacy docs without field → 0). */
export function teamGroupIndex(team: { groupIndex?: number }): number {
  const g = team.groupIndex;
  return typeof g === 'number' && g >= 0 ? g : 0;
}

/** Distinct group slots (0 … groupCount−1) that have at least one team. */
export function countGroupsWithTeams(
  teams: { groupIndex?: number }[],
  groupCount: number,
): number {
  const gc = normalizeGroupCount(groupCount);
  if (teams.length === 0) return 0;
  const seen = new Set<number>();
  for (const team of teams) {
    const gi = Math.min(gc - 1, Math.max(0, teamGroupIndex(team)));
    seen.add(gi);
  }
  return seen.size;
}

/**
 * True when teams should be redistributed: any group over capacity, or every team is still in group 1
 * (legacy missing groupIndex) while other groups are empty.
 */
export function shouldOfferGroupRebalance(
  teams: { groupIndex?: number }[],
  groupCount: number,
  teamsPerGroup: number
): boolean {
  if (teams.length === 0 || groupCount < 2) return false;
  const buckets = Array.from({ length: groupCount }, () => 0);
  for (const team of teams) {
    const gi = Math.min(groupCount - 1, Math.max(0, teamGroupIndex(team)));
    buckets[gi]++;
  }
  if (buckets.some((c) => c > teamsPerGroup)) return true;
  const nonEmpty = buckets.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  if (nonEmpty.length === 1 && nonEmpty[0] === 0 && teams.length > 1) return true;
  return false;
}
