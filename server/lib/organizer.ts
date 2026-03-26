/** Tournament doc shape for organizer checks */
export function isTournamentOrganizer(
  tournament: { organizerIds?: unknown[] },
  userId: string
): boolean {
  if (!userId || typeof userId !== 'string') return false;
  const uid = userId.trim();
  const ids = tournament.organizerIds;
  if (!Array.isArray(ids)) return false;
  /** MongoDB may return ObjectId in arrays; compare as strings. */
  return ids.some((o) => String(o).trim() === uid);
}
