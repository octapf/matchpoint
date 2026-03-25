/** Tournament doc shape for organizer checks */
export function isTournamentOrganizer(
  tournament: { organizerIds?: string[] },
  userId: string
): boolean {
  return Array.isArray(tournament.organizerIds) && tournament.organizerIds.includes(userId);
}
