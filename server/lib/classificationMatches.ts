import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Match, TournamentDivision } from '../../types';
import { normalizeGroupCount, teamGroupIndex, validateTournamentGroups } from '../../lib/tournamentGroups';

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export async function randomizeTeamGroups(
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
  const maxT = Number((t as { maxTeams?: number }).maxTeams);
  const gc = normalizeGroupCount((t as { groupCount?: number }).groupCount);
  const vg = validateTournamentGroups(maxT, gc);
  if (!vg.ok) throw new Error('Invalid tournament group configuration');

  const teams = await teamsCol.find({ tournamentId }).sort({ createdAt: 1, _id: 1 }).toArray();
  const shuffled = fisherYates(teams);
  const now = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < shuffled.length; i++) {
    const gi = i % vg.groupCount;
    const doc = shuffled[i] as { _id: unknown; groupIndex?: number };
    const cur = typeof doc.groupIndex === 'number' ? doc.groupIndex : -1;
    if (cur !== gi) {
      await teamsCol.updateOne({ _id: doc._id as ObjectId }, { $set: { groupIndex: gi, updatedAt: now } });
      updated++;
    }
  }
  return { updated, teams: teams.length };
}

export function buildClassificationPairs(teamIds: string[], matchesPerOpponent: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const m = Math.max(1, Math.floor(matchesPerOpponent));
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const a = teamIds[i]!;
      const b = teamIds[j]!;
      for (let k = 0; k < m; k++) out.push([a, b]);
    }
  }
  return out;
}

export async function generateClassificationMatches(
  db: Db,
  tournamentId: string,
  opts: { division?: TournamentDivision; matchesPerOpponent: number; pointsToWin: number; setsPerMatch: number }
): Promise<{ created: number; total: number }> {
  const teamsCol = db.collection('teams');
  const matchesCol = db.collection('matches');

  const teams = await teamsCol.find({ tournamentId }).toArray();
  // Group buckets based on current groupIndex (clamped).
  const groups = new Map<number, string[]>();
  for (const tm of teams) {
    const id = String((tm as { _id?: unknown })._id ?? '');
    if (!id) continue;
    const gi = Math.max(0, teamGroupIndex(tm as { groupIndex?: number }));
    const list = groups.get(gi) ?? [];
    list.push(id);
    groups.set(gi, list);
  }

  const now = new Date().toISOString();
  let created = 0;
  let total = 0;
  for (const [groupIndex, ids] of groups.entries()) {
    if (ids.length < 2) continue;
    const pairs = buildClassificationPairs(ids, opts.matchesPerOpponent);
    total += pairs.length;
    for (const [a, b] of pairs) {
      const doc: Omit<Match, '_id'> = {
        tournamentId,
        stage: 'classification',
        division: opts.division,
        groupIndex,
        category: undefined,
        teamAId: a,
        teamBId: b,
        setsPerMatch: opts.setsPerMatch,
        pointsToWin: opts.pointsToWin,
        status: 'scheduled',
        createdAt: now,
        updatedAt: now,
      };
      await matchesCol.insertOne(doc as unknown as Record<string, unknown>);
      created++;
    }
  }
  return { created, total };
}

