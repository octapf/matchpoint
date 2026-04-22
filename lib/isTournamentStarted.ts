/** True once the tournament has left the pre-play phase (matches / classification underway or finished). */
export function isTournamentStarted(t: { startedAt?: unknown; phase?: unknown } | null | undefined): boolean {
  if (!t) return false;
  const phase = String((t as { phase?: unknown }).phase ?? '');
  return (
    !!(t as { startedAt?: unknown }).startedAt ||
    phase === 'classification' ||
    phase === 'categories' ||
    phase === 'completed'
  );
}
