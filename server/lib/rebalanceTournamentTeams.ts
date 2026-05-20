import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { normalizeGroupCount, validateTournamentGroups } from '../../lib/tournamentGroups';
import { isTournamentStarted } from '../../lib/tournamentPlayAllowed';
import type { TournamentDivision } from '../../types';
import {
  deriveTournamentGroupConfig,
  divisionIndexForTournamentDivision,
  groupIndicesForDivisionIndex,
} from './tournamentConfig';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

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
  if (isTournamentStarted(t as { startedAt?: unknown; phase?: unknown })) {
    throw new Error('Tournament has started');
  }
  const locked = await db.collection('matches').countDocuments({
    ...tournamentIdMongoFilter(tournamentId),
    status: { $in: ['in_progress', 'completed'] },
  });
  if (locked > 0) {
    throw new Error('Tournament has started');
  }
  const maxT = Number((t as { maxTeams?: number }).maxTeams);
  const gc = normalizeGroupCount((t as { groupCount?: number }).groupCount);
  const vg = validateTournamentGroups(maxT, gc);
  if (!vg.ok) throw new Error('Invalid tournament group configuration');
  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });

  const teams = await teamsCol.find(tournamentIdMongoFilter(tournamentId)).sort({ createdAt: 1, _id: 1 }).toArray();
  const now = new Date().toISOString();
  let updated = 0;
  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  const byDivision = new Map<number, typeof teams>();
  for (const tm of teams) {
    const doc = tm as { division?: unknown; groupIndex?: unknown };
    const rawDivision = typeof doc.division === 'string' ? (doc.division as TournamentDivision) : undefined;
    const currentGroup = typeof doc.groupIndex === 'number' ? doc.groupIndex : 0;
    const slice =
      rawDivision != null
        ? divisionIndexForTournamentDivision(cfg, rawDivision)
        : cfg.divisionIndexForGroupIndex(currentGroup);
    const safeSlice = Math.min(cfg.divisionCount - 1, Math.max(0, slice));
    const list = byDivision.get(safeSlice) ?? [];
    list.push(tm);
    byDivision.set(safeSlice, list);
  }

  for (const [slice, sliceTeams] of byDivision.entries()) {
    const groupIndices = groupIndicesForDivisionIndex(cfg, slice);
    const slots: number[] = [];
    for (const gi of groupIndices) {
      for (let k = 0; k < vg.teamsPerGroup; k++) slots.push(gi);
    }
    if (sliceTeams.length > slots.length) {
      throw new Error(
        `Too many teams in division slice ${slice} (${sliceTeams.length}) for group capacity (${slots.length}). Check maxTeams / groupCount vs divisions.`
      );
    }
    for (let i = 0; i < sliceTeams.length; i++) {
      const gi = slots[i]!;
      const doc = sliceTeams[i] as { _id: unknown; groupIndex?: number };
      const cur = typeof doc.groupIndex === 'number' ? doc.groupIndex : -1;
      if (cur !== gi) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id as ObjectId },
            update: { $set: { groupIndex: gi, updatedAt: now } },
          },
        });
        updated++;
      }
    }
  }
  if (ops.length > 0) await teamsCol.bulkWrite(ops, { ordered: false });
  return { updated, teams: teams.length };
}
