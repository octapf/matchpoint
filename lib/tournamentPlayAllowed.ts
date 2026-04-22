import { isTournamentStarted } from './isTournamentStarted';

export { isTournamentStarted };

/** Organizer paused the tournament day — match play and betting are frozen until resumed. */
export function isTournamentPaused(t: { paused?: unknown } | null | undefined): boolean {
  return !!(t && (t as { paused?: unknown }).paused === true);
}

/** Live match actions and betting are allowed (day started and not paused). */
export function isTournamentPlayActive(t: { startedAt?: unknown; phase?: unknown; paused?: unknown } | null | undefined): boolean {
  return isTournamentStarted(t) && !isTournamentPaused(t);
}
