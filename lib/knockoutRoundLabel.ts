/**
 * Knockout list headings: (1) distance from final among distinct `bracketRound` buckets,
 * (2) effective bracket size K = max(nextPow2(teamCount), 2^mainRoundCount).
 * With byes, the plan can be an 8-slot tree while only 4 teams exist — mainRoundCount reflects
 * real depth so "Cuartos" still applies to the first playing round, not "Semifinal".
 */

function nextPowerOf2(n: number): number {
  const x = Math.max(2, Math.floor(n));
  return 2 ** Math.ceil(Math.log2(x));
}

/**
 * Prefer server/classification team list length; else infer from unique team ids in rows, else first-round match count × 2.
 */
export function estimateCategoryBracketTeamCount(
  rows: {
    bracketRound?: number;
    isBronzeMatch?: boolean;
    teamA?: { _id?: string };
    teamB?: { _id?: string };
  }[]
): number {
  const main = rows.filter((r) => !r.isBronzeMatch);
  const ids = new Set<string>();
  for (const r of main) {
    const a = String(r.teamA?._id ?? '').trim();
    const b = String(r.teamB?._id ?? '').trim();
    if (a && a !== 'pending') ids.add(a);
    if (b && b !== 'pending') ids.add(b);
  }
  if (ids.size >= 2) return ids.size;

  const rounds = [...new Set(main.map((r) => r.bracketRound ?? 0))]
    .filter((br) => br > 0)
    .sort((a, b) => a - b);
  if (rounds.length === 0) return 2;
  const first = rounds[0]!;
  const m = main.filter((r) => r.bracketRound === first).length;
  return Math.max(2, m * 2);
}

/**
 * @param roundIndexFromEnd — 0 = final, 1 = one step before final, … among main-bracket `bracketRound` values (sorted).
 * @param teamCountInCategory — teams in this category (or best estimate).
 * @param mainRoundCount — distinct main-bracket `bracketRound` values (= columns in the tree). Used with byes: depth implies K.
 */
export function resolveKnockoutRoundHeading(
  roundIndexFromEnd: number,
  roundNumberForFallback: number,
  teamCountInCategory: number,
  mainRoundCount: number,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  const n = Math.max(2, teamCountInCategory);
  const kFromTeams = nextPowerOf2(n);
  const kFromDepth =
    mainRoundCount > 0 ? 2 ** mainRoundCount : kFromTeams;
  const K = Math.max(kFromTeams, kFromDepth);

  if (roundIndexFromEnd === 0) return t('tournamentDetail.bracketPhaseFinal');
  if (roundIndexFromEnd === 1) return t('tournamentDetail.bracketPhaseSemi');

  // Deeper phases only exist in larger brackets; clamp names when API sends extra round numbers.
  if (roundIndexFromEnd === 2) {
    if (K >= 8) return t('tournamentDetail.bracketPhaseQuarter');
    return t('tournamentDetail.bracketPhaseSemi');
  }
  if (roundIndexFromEnd === 3) {
    if (K >= 16) return t('tournamentDetail.bracketPhaseOctavos');
    if (K >= 8) return t('tournamentDetail.bracketPhaseQuarter');
    return t('tournamentDetail.bracketPhaseSemi');
  }
  if (roundIndexFromEnd === 4) {
    if (K >= 32) return t('tournamentDetail.bracketPhaseRoundOf32');
    if (K >= 16) return t('tournamentDetail.bracketPhaseOctavos');
    if (K >= 8) return t('tournamentDetail.bracketPhaseQuarter');
    return t('tournamentDetail.bracketPhaseSemi');
  }

  return t('tournamentDetail.bracketRoundHeading', { n: roundNumberForFallback });
}

/**
 * One heading per main-bracket column, same rules as the fixture list (distance from final + K / byes).
 * Order matches `buildMainLayers` / CategoryBracketDiagram columns (sorted bracketRound).
 */
export function mainBracketColumnHeadings(
  matches: {
    bracketRound?: number;
    isBronzeMatch?: boolean;
    orderIndex?: number;
    teamA?: { _id?: string };
    teamB?: { _id?: string };
  }[],
  t: (key: string, options?: Record<string, string | number>) => string
): string[] {
  const main = matches.filter((m) => !m.isBronzeMatch);
  if (main.length === 0) return [];

  const byRound = new Map<number, typeof main>();
  for (const m of main) {
    const r = typeof m.bracketRound === 'number' ? m.bracketRound : 0;
    const list = byRound.get(r) ?? [];
    list.push(m);
    byRound.set(r, list);
  }
  const roundKeys = [...byRound.keys()].sort((a, b) => a - b);

  const distinctMainBracketRounds = roundKeys.filter((br) => br > 0);
  const teamCount = estimateCategoryBracketTeamCount(matches);
  const mainRoundCount = distinctMainBracketRounds.length;

  return roundKeys.map((round) => {
    const idx = distinctMainBracketRounds.indexOf(round);
    if (idx < 0) {
      return t('tournamentDetail.bracketRoundHeading', { n: round });
    }
    const roundIndexFromEnd = distinctMainBracketRounds.length - 1 - idx;
    return resolveKnockoutRoundHeading(roundIndexFromEnd, round, teamCount, mainRoundCount, t);
  });
}

/**
 * Knockout phase label for one category match (same rules as bracket column headings / fixture list).
 */
export function knockoutRoundLabelForCategoryMatch(
  m: {
    bracketRound?: number;
    isBronzeMatch?: boolean;
  },
  categoryMatches: { bracketRound?: number; isBronzeMatch?: boolean }[],
  teamCountInCategory: number,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (m.isBronzeMatch) {
    return t('tournamentDetail.bracketBronzeHeading');
  }
  const main = categoryMatches.filter((x) => !x.isBronzeMatch);
  const distinctMainBracketRounds = [
    ...new Set(main.map((r) => r.bracketRound ?? 0).filter((br) => br > 0)),
  ].sort((a, b) => a - b);
  const r = typeof m.bracketRound === 'number' ? m.bracketRound : 0;
  const idx = distinctMainBracketRounds.indexOf(r);
  if (idx < 0) {
    return t('tournamentDetail.bracketRoundHeading', { n: r });
  }
  const roundIndexFromEnd = distinctMainBracketRounds.length - 1 - idx;
  return resolveKnockoutRoundHeading(
    roundIndexFromEnd,
    r,
    teamCountInCategory,
    distinctMainBracketRounds.length,
    t
  );
}

/**
 * Smallest `bracketRound` (chronological order in the tree) that still has a non-completed main match.
 * `null` when every main-bracket match is completed.
 */
export function computeMainPlayingBracketRound(
  mainMatches: { bracketRound?: number; status?: string }[]
): number | null {
  const rounds = [
    ...new Set(mainMatches.map((m) => m.bracketRound ?? 0).filter((k) => k > 0)),
  ].sort((a, b) => a - b);
  for (const r of rounds) {
    const inRound = mainMatches.filter((m) => m.bracketRound === r);
    if (inRound.some((m) => m.status !== 'completed')) return r;
  }
  return null;
}

/**
 * Show "vs" instead of a numeric score when this match’s round is not the active one yet,
 * or the match has not started in the active round (bronze: until live or finished).
 */
export function bracketMatchShouldShowVsPlaceholder(
  m: {
    bracketRound?: number;
    isBronzeMatch?: boolean;
    status?: string;
    pointsA?: number;
    pointsB?: number;
  },
  allMatches: {
    bracketRound?: number;
    isBronzeMatch?: boolean;
    status?: string;
    pointsA?: number;
    pointsB?: number;
  }[]
): boolean {
  if (m.isBronzeMatch) {
    return m.status !== 'completed' && m.status !== 'in_progress';
  }
  const main = allMatches.filter((x) => !x.isBronzeMatch);
  const playingRound = computeMainPlayingBracketRound(main);
  const r = m.bracketRound ?? 0;
  if (playingRound === null) {
    return m.status === 'scheduled' && (m.pointsA ?? 0) === 0 && (m.pointsB ?? 0) === 0;
  }
  if (r > playingRound) return true;
  if (r < playingRound) return false;
  if (m.status === 'completed' || m.status === 'in_progress') return false;
  return true;
}
