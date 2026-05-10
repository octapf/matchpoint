import type { VercelRequest } from '@vercel/node';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { getSessionUserId, isUserAdmin, loadActorUserWithAdminRefresh } from './auth';
import { isTournamentOrganizer } from './organizer';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

export type TournamentReadVisibilityResult =
  | { ok: true; tournament: Record<string, unknown> }
  | { ok: false; status: 400 | 404; error: string };

function isPrivateTournament(tournament: { visibility?: unknown }): boolean {
  return typeof tournament.visibility === 'string' && tournament.visibility.toLowerCase() === 'private';
}

/**
 * Applies the same "private tournaments look not-found to outsiders" rule used by
 * the tournament detail endpoint before returning related participant collections.
 */
export async function assertTournamentReadable(
  req: VercelRequest,
  db: Db,
  tournamentId: string,
  tournament?: Record<string, unknown> | null
): Promise<TournamentReadVisibilityResult> {
  if (!ObjectId.isValid(tournamentId)) {
    return { ok: false, status: 400, error: 'Invalid tournament ID' };
  }

  const doc =
    tournament ??
    ((await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) })) as Record<string, unknown> | null);
  if (!doc) {
    return { ok: false, status: 404, error: 'Tournament not found' };
  }

  if (!isPrivateTournament(doc)) {
    return { ok: true, tournament: doc };
  }

  const actorId = getSessionUserId(req);
  if (!actorId) {
    return { ok: false, status: 404, error: 'Tournament not found' };
  }

  const actorUser = await loadActorUserWithAdminRefresh(db, actorId);
  const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
  const actorIsOrganizer = isTournamentOrganizer(doc as { organizerIds?: string[] }, actorId);
  if (actorIsAdmin || actorIsOrganizer) {
    return { ok: true, tournament: doc };
  }

  const tidf = tournamentIdMongoFilter(tournamentId);
  const [hasEntry, onWaitlist] = await Promise.all([
    db.collection('entries').findOne({ ...tidf, userId: actorId }),
    db.collection('waitlist').findOne({ ...tidf, userId: actorId }),
  ]);
  if (!hasEntry && !onWaitlist) {
    return { ok: false, status: 404, error: 'Tournament not found' };
  }

  return { ok: true, tournament: doc };
}
