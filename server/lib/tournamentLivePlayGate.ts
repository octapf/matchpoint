import { ObjectId, type Db } from 'mongodb';
import { isTournamentStarted } from '../../lib/isTournamentStarted';
import { isTournamentPaused } from '../../lib/tournamentPlayAllowed';

/** Blocks live scoring, serve edits, betting, etc. when the day has not started or the tournament is paused. */
export async function assertTournamentAllowsLiveMatchActions(
  db: Db,
  tournamentId: string
): Promise<null | { status: number; error: string }> {
  if (!ObjectId.isValid(tournamentId)) return { status: 400, error: 'Invalid tournament' };
  const oid = new ObjectId(tournamentId);
  const tour = await db.collection('tournaments').findOne({ _id: oid }, { projection: { startedAt: 1, phase: 1, paused: 1 } });
  if (!tour) return { status: 404, error: 'Tournament not found' };
  const tourGate = tour as { startedAt?: unknown; phase?: unknown; paused?: unknown };
  if (!isTournamentStarted(tourGate)) return { status: 400, error: 'Tournament has not started' };
  if (isTournamentPaused(tourGate)) return { status: 400, error: 'Tournament is paused' };
  return null;
}
