import type { TournamentDivision } from '@/types';

/** Inferred division from two genders (same rules as server `divisionForPair`). */
export function divisionForPair(g1?: string, g2?: string): TournamentDivision {
  if (g1 === 'male' && g2 === 'male') return 'men';
  if (g1 === 'female' && g2 === 'female') return 'women';
  return 'mixed';
}

/** Returns true if the pair's division is enabled for the tournament. */
export function isPairValidForTournamentDivisions(
  tournamentDivisions: TournamentDivision[] | undefined,
  g1?: string,
  g2?: string
): { ok: true; division: TournamentDivision } | { ok: false; division: TournamentDivision; reason: string } {
  const divs = tournamentDivisions?.length ? tournamentDivisions : (['mixed'] as TournamentDivision[]);
  const pairDiv = divisionForPair(g1, g2);
  if (!divs.includes(pairDiv)) {
    return {
      ok: false,
      division: pairDiv,
      reason: `This pair competes in ${pairDiv}, which is not enabled for this tournament`,
    };
  }
  return { ok: true, division: pairDiv };
}
