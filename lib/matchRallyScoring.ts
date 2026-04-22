/**
 * Live rally scoring for a single set (match detail + `refereePoint`).
 * After at least one side reaches `pointsToWin`, the set is won only with a 2-point lead (deuce).
 * Organizer/referee "End match — pick winner" uses `updateMatch` + `finalize` and may set any final score (e.g. 25–24).
 */

/** Hard cap so scores cannot grow without bound via taps. */
export const RALLY_POINTS_ABS_CAP = 99;

/**
 * True when this set score is a regulation win (reached target and lead ≥ 2).
 */
export function isRallySetComplete(pointsA: number, pointsB: number, pointsToWin: number): boolean {
  const n = Math.max(1, Math.min(99, Math.floor(Number(pointsToWin) || 21)));
  const a = Math.max(0, Math.floor(Number(pointsA) || 0));
  const b = Math.max(0, Math.floor(Number(pointsB) || 0));
  if (Math.max(a, b) < n) return false;
  return Math.abs(a - b) >= 2;
}
