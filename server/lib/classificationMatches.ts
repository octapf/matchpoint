import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Match, TournamentDivision } from '../../types';
import { normalizeGroupCount, teamGroupIndex, validateTournamentGroups } from '../../lib/tournamentGroups';
import { deriveTournamentGroupConfig } from './tournamentConfig';

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
  const capacity = vg.groupCount * vg.teamsPerGroup;
  if (teams.length > capacity) {
    throw new Error('Too many teams for configured groups');
  }
  if (teams.length !== maxT) {
    throw new Error('All team slots must be filled before creating groups');
  }

  const divisionsRaw = Array.isArray((t as { divisions?: unknown }).divisions)
    ? ((t as { divisions?: unknown }).divisions as unknown[])
    : [];
  const divisions = divisionsRaw
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d): d is TournamentDivision => d === 'men' || d === 'women' || d === 'mixed');
  const divisionCount = Math.max(1, divisions.length || 1);
  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });

  // Determine division by player genders so we never mix divisions.
  const allPlayerIds = Array.from(
    new Set(
      teams
        .flatMap((tm) => (tm as { playerIds?: unknown }).playerIds as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    )
  );
  const users = await db
    .collection('users')
    .find({ _id: { $in: allPlayerIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } })
    .project({ gender: 1 })
    .toArray();
  const genderById = new Map<string, string>();
  for (const u of users as unknown as { _id: ObjectId; gender?: unknown }[]) {
    genderById.set(u._id.toString(), typeof u.gender === 'string' ? u.gender : '');
  }
  const divisionIndexByKey = new Map<TournamentDivision, number>();
  if (divisions.length > 0) {
    for (let i = 0; i < divisions.length; i++) divisionIndexByKey.set(divisions[i]!, i);
  }

  const teamSliceIndex = (tm: unknown): number => {
    const pids = (tm as { playerIds?: unknown }).playerIds;
    const a = Array.isArray(pids) ? String(pids[0] ?? '') : '';
    const b = Array.isArray(pids) ? String(pids[1] ?? '') : '';
    const g1 = genderById.get(a) ?? '';
    const g2 = genderById.get(b) ?? '';
    const div: TournamentDivision =
      g1 === 'male' && g2 === 'male' ? 'men' : g1 === 'female' && g2 === 'female' ? 'women' : 'mixed';
    const idx = divisionIndexByKey.get(div);
    return idx != null ? idx : 0;
  };

  const bySlice = new Map<number, typeof teams>();
  for (const tm of teams) {
    const slice = Math.min(divisionCount - 1, Math.max(0, teamSliceIndex(tm)));
    const list = bySlice.get(slice) ?? [];
    list.push(tm);
    bySlice.set(slice, list);
  };

  const now = new Date().toISOString();
  let updated = 0;
  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];

  for (const [slice, sliceTeams] of bySlice.entries()) {
    const shuffled = fisherYates(sliceTeams);
    const groupsThisSlice = cfg.groupsPerDivision(slice);
    const groupBase = cfg.divisionGroupOffset(slice);
    const slots: number[] = [];
    for (let gi = 0; gi < groupsThisSlice; gi++) {
      for (let k = 0; k < vg.teamsPerGroup; k++) slots.push(groupBase + gi);
    }
    if (shuffled.length > slots.length) {
      throw new Error(
        `Too many teams in division slice ${slice} (${shuffled.length}) for group capacity (${slots.length}). Check maxTeams / groupCount vs divisions.`
      );
    }
    for (let i = 0; i < shuffled.length; i++) {
      const nextGi = slots[i]!;
      const doc = shuffled[i] as { _id: unknown; groupIndex?: number };
      const cur = typeof doc.groupIndex === 'number' ? doc.groupIndex : -1;
      if (cur !== nextGi) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id as ObjectId },
            update: { $set: { groupIndex: nextGi, updatedAt: now } },
          },
        });
        updated++;
      }
    }
  }
  if (ops.length > 0) await teamsCol.bulkWrite(ops, { ordered: false });
  await tournamentsCol.updateOne(
    { _id: new ObjectId(tournamentId) },
    { $set: { groupsDistributedAt: now, updatedAt: now } }
  );
  return { updated, teams: teams.length };
}

export function buildClassificationPairs(teamIds: string[], matchesPerOpponent: number): [string, string][] {
  const out: [string, string][] = [];
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
  opts: { matchesPerOpponent: number; pointsToWin: number; setsPerMatch: number }
): Promise<{ created: number; total: number }> {
  const teamsCol = db.collection('teams');
  const matchesCol = db.collection('matches');

  const t = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });
  const divisions = cfg.divisions.length ? cfg.divisions : (['mixed'] as TournamentDivision[]);

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

  const divisionForGroupIndex = (groupIndex: number): TournamentDivision | undefined => {
    if (divisions.length <= 1) return divisions[0];
    const di = cfg.divisionIndexForGroupIndex(groupIndex);
    return divisions[di] ?? divisions[0];
  };

  const now = new Date().toISOString();
  const baseMs = Date.parse(now);
  let created = 0;
  let total = 0;
  for (const [groupIndex, ids] of groups.entries()) {
    if (ids.length < 2) continue;
    const pairs = buildClassificationPairs(ids, opts.matchesPerOpponent);
    total += pairs.length;
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i]!;
      const doc: Omit<Match, '_id'> = {
        tournamentId,
        stage: 'classification',
        division: divisionForGroupIndex(groupIndex),
        groupIndex,
        category: undefined,
        teamAId: a,
        teamBId: b,
        setsPerMatch: opts.setsPerMatch,
        pointsToWin: opts.pointsToWin,
        status: 'scheduled',
        orderIndex: i,
        scheduledAt: Number.isFinite(baseMs) ? new Date(baseMs + i * 60_000).toISOString() : now,
        createdAt: now,
        updatedAt: now,
      };
      await matchesCol.insertOne(doc as unknown as Record<string, unknown>);
      created++;
    }
  }
  return { created, total };
}

