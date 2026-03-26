import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { maxPlayerSlotsForTournament } from '../../lib/tournamentGroups';

/**
 * Sets tournament `status` to `open` or `full` from entry count vs capacity.
 * Skips when status is `cancelled` (organizer-controlled).
 */
export async function syncTournamentOpenFullStatus(db: Db, tournamentId: string): Promise<void> {
  if (!ObjectId.isValid(tournamentId)) return;
  const oid = new ObjectId(tournamentId);
  const tournamentsCol = db.collection('tournaments');
  const tournament = await tournamentsCol.findOne({ _id: oid });
  if (!tournament) return;

  const doc = tournament as { status?: string; maxTeams?: number };
  if (doc.status === 'cancelled') return;

  const entriesCol = db.collection('entries');
  const count = await entriesCol.countDocuments({ tournamentId });
  const cap = maxPlayerSlotsForTournament(Number(doc.maxTeams ?? 16));
  const next: 'open' | 'full' = count >= cap ? 'full' : 'open';

  if (doc.status === next) return;

  await tournamentsCol.updateOne(
    { _id: oid },
    { $set: { status: next, updatedAt: new Date().toISOString() } },
  );
}
