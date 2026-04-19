import type { Db } from 'mongodb';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

/**
 * Removes all Mongo documents scoped to a tournament (string or ObjectId `tournamentId`),
 * except the `tournaments` document itself. Caller must delete the tournament doc after this.
 * Order: entries and teams first (roster), then guests, waitlist, matches, bets.
 */
export async function purgeTournamentRelatedData(db: Db, tournamentId: string): Promise<void> {
  const tid = tournamentIdMongoFilter(tournamentId);
  await db.collection('entries').deleteMany(tid);
  await db.collection('teams').deleteMany(tid);
  await db.collection('tournament_guest_players').deleteMany(tid);
  await db.collection('waitlist').deleteMany(tid);
  await db.collection('matches').deleteMany(tid);
  await db.collection('tournamentBets').deleteMany(tid);
}
