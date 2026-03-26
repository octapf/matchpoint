import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { normalizeGroupCount, validateTournamentGroups } from '../../lib/tournamentGroups';

/**
 * Round-robin assign groupIndex (0..groupCount-1) by createdAt so each group stays within capacity.
 */
export async function rebalanceTournamentTeams(
  db: Db,
  tournamentId: string
): Promise<{ updated: number; teams: number }> {
  const tournamentsCol = db.collection('tournaments');
  const teamsCol = db.collection('teams');
  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const maxT = Number((t as { maxTeams?: number }).maxTeams);
  const gc = normalizeGroupCount((t as { groupCount?: number }).groupCount);
  const vg = validateTournamentGroups(maxT, gc);
  if (!vg.ok) throw new Error('Invalid tournament group configuration');

  const teams = await teamsCol.find({ tournamentId }).sort({ createdAt: 1, _id: 1 }).toArray();
  const now = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < teams.length; i++) {
    const gi = i % vg.groupCount;
    const doc = teams[i] as { _id: unknown; groupIndex?: number };
    const cur = typeof doc.groupIndex === 'number' ? doc.groupIndex : -1;
    if (cur !== gi) {
      await teamsCol.updateOne({ _id: doc._id as ObjectId }, { $set: { groupIndex: gi, updatedAt: now } });
      updated++;
    }
  }
  return { updated, teams: teams.length };
}
