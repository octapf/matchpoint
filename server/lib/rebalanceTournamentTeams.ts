import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { TournamentDivision } from '../../types';
import { normalizeGroupCount, teamGroupIndex, validateTournamentGroups } from '../../lib/tournamentGroups';
import { deriveTournamentGroupConfig } from './tournamentConfig';

const VALID_DIVISIONS = new Set<TournamentDivision>(['men', 'women', 'mixed']);

/**
 * Round-robin assign groupIndex by division so each group stays within capacity.
 */
export async function rebalanceTournamentTeams(
  db: Db,
  tournamentId: string
): Promise<{ updated: number; teams: number }> {
  const tournamentsCol = db.collection('tournaments');
  const teamsCol = db.collection('teams');
  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const startedAt = (t as { startedAt?: unknown }).startedAt;
  const phase = String((t as { phase?: unknown }).phase ?? '');
  if (startedAt || phase === 'classification' || phase === 'categories' || phase === 'completed') {
    throw new Error('Tournament has started');
  }

  const matchesCol = db.collection('matches');
  const locked = await matchesCol.countDocuments({
    tournamentId,
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
  const divisionIndexByKey = new Map<TournamentDivision, number>();
  for (let i = 0; i < cfg.divisions.length; i++) {
    divisionIndexByKey.set(cfg.divisions[i]!, i);
  }

  const teams = await teamsCol.find({ tournamentId }).sort({ createdAt: 1, _id: 1 }).toArray();
  const now = new Date().toISOString();
  let updated = 0;
  const bySlice = new Map<number, typeof teams>();
  for (const tm of teams) {
    const div = String((tm as { division?: unknown }).division ?? '') as TournamentDivision;
    const configuredSlice = VALID_DIVISIONS.has(div) ? divisionIndexByKey.get(div) : undefined;
    const fallbackSlice = cfg.divisionIndexForGroupIndex(teamGroupIndex(tm as { groupIndex?: number }));
    const slice = Math.min(cfg.divisionCount - 1, Math.max(0, configuredSlice ?? fallbackSlice));
    const list = bySlice.get(slice) ?? [];
    list.push(tm);
    bySlice.set(slice, list);
  }

  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  for (const [slice, sliceTeams] of bySlice.entries()) {
    const groupsThisSlice = cfg.groupsPerDivision(slice);
    const groupBase = cfg.divisionGroupOffset(slice);
    const slots: number[] = [];
    for (let gi = 0; gi < groupsThisSlice; gi++) {
      for (let k = 0; k < vg.teamsPerGroup; k++) slots.push(groupBase + gi);
    }
    if (sliceTeams.length > slots.length) {
      throw new Error('Too many teams in a division for configured groups');
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
