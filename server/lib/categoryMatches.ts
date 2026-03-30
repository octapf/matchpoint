import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Match, TournamentCategory, TournamentDivision } from '../../types';
import { normalizeGroupCount, teamGroupIndex, validateTournamentGroups } from '../../lib/tournamentGroups';
import { computeStandingsForGroup, assignCategoriesForDivision } from './tournamentStandings';

function buildPairs(teamIds: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) out.push([teamIds[i]!, teamIds[j]!]);
  }
  return out;
}

export async function generateCategoryMatches(
  db: Db,
  tournamentId: string
): Promise<{ created: number; total: number; categories: TournamentCategory[] }> {
  const tournamentsCol = db.collection('tournaments');
  const teamsCol = db.collection('teams');
  const matchesCol = db.collection('matches');

  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const phase = String((t as { phase?: unknown }).phase ?? '');
  if (phase !== 'classification') throw new Error('Tournament is not in classification phase');

  const maxT = Number((t as { maxTeams?: unknown }).maxTeams);
  const gc = normalizeGroupCount((t as { groupCount?: unknown }).groupCount);
  const vg = validateTournamentGroups(maxT, gc);
  if (!vg.ok) throw new Error('Invalid tournament group configuration');

  const categories = Array.isArray((t as { categories?: unknown }).categories)
    ? ((t as { categories?: unknown }).categories as unknown[])
        .filter((c): c is TournamentCategory => c === 'Gold' || c === 'Silver' || c === 'Bronze')
    : ([] as TournamentCategory[]);

  const categoryFractions =
    (t as { categoryFractions?: unknown }).categoryFractions && typeof (t as { categoryFractions?: unknown }).categoryFractions === 'object'
      ? ((t as { categoryFractions?: unknown }).categoryFractions as Partial<Record<TournamentCategory, number>>)
      : null;
  const singleCategoryAdvanceFractionRaw = Number((t as { singleCategoryAdvanceFraction?: unknown }).singleCategoryAdvanceFraction ?? 0.5);
  const singleCategoryAdvanceFraction = Number.isFinite(singleCategoryAdvanceFractionRaw) ? singleCategoryAdvanceFractionRaw : 0.5;

  const divisionsRaw = Array.isArray((t as { divisions?: unknown }).divisions)
    ? ((t as { divisions?: unknown }).divisions as unknown[])
    : [];
  const divisions = divisionsRaw
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d): d is TournamentDivision => d === 'men' || d === 'women' || d === 'mixed');
  const divisionCount = Math.max(1, divisions.length || 1);
  const groupsPerDivision = divisionCount > 1 && vg.groupCount % divisionCount === 0 ? vg.groupCount / divisionCount : vg.groupCount;

  const teams = await teamsCol.find({ tournamentId }).toArray();
  const allMatches = await matchesCol.find({ tournamentId }).toArray();
  const classificationMatches = allMatches.filter((m) => (m as { stage?: unknown }).stage === 'classification');
  if (classificationMatches.length === 0) throw new Error('No classification matches found');
  if (classificationMatches.some((m) => (m as { status?: unknown }).status !== 'completed')) {
    throw new Error('Classification is not completed');
  }

  // Remove existing category matches before regenerating.
  await matchesCol.deleteMany({ tournamentId, stage: 'category' });

  const now = new Date().toISOString();
  let created = 0;
  let total = 0;

  for (let di = 0; di < divisionCount; di++) {
    const base = di * groupsPerDivision;
    const groupIndices = Array.from({ length: groupsPerDivision }, (_, i) => base + i);

    const teamsByGroup = new Map<number, { _id: string; name: string }[]>();
    for (const gi of groupIndices) teamsByGroup.set(gi, []);
    for (const tm of teams) {
      const id = String((tm as { _id?: unknown })._id ?? '');
      if (!id) continue;
      const gi = teamGroupIndex(tm as { groupIndex?: number });
      if (!teamsByGroup.has(gi)) continue;
      teamsByGroup.get(gi)!.push({ _id: id, name: String((tm as { name?: unknown }).name ?? '') });
    }

    const standingsByGroup = groupIndices.map((gi) => {
      const groupTeams = teamsByGroup.get(gi) ?? [];
      const groupMatches = classificationMatches.filter(
        (m) => Number((m as { groupIndex?: unknown }).groupIndex ?? -1) === gi
      );
      return computeStandingsForGroup({ teams: groupTeams, matches: groupMatches as any });
    });

    const { teamCategory } = assignCategoriesForDivision({
      standingsByGroup,
      categories,
      categoryFractions,
      singleCategoryAdvanceFraction,
    });

    // Generate round-robin matches within each category across the whole division.
    const teamsByCategory = new Map<TournamentCategory, string[]>();
    for (const [tid, cat] of teamCategory.entries()) {
      const list = teamsByCategory.get(cat) ?? [];
      list.push(tid);
      teamsByCategory.set(cat, list);
    }

    const pointsToWin = Math.max(1, Math.min(99, Number((t as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
    const setsPerMatch = Math.max(1, Math.min(7, Number((t as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

    for (const [cat, teamIds] of teamsByCategory.entries()) {
      if (teamIds.length < 2) continue;
      const pairs = buildPairs(teamIds);
      total += pairs.length;
      for (const [a, b] of pairs) {
        const doc: Omit<Match, '_id'> = {
          tournamentId,
          stage: 'category',
          division: divisions[di] ?? undefined,
          groupIndex: undefined,
          category: cat,
          teamAId: a,
          teamBId: b,
          setsPerMatch,
          pointsToWin,
          status: 'scheduled',
          createdAt: now,
          updatedAt: now,
        };
        await matchesCol.insertOne(doc as unknown as Record<string, unknown>);
        created++;
      }
    }
  }

  await tournamentsCol.updateOne(
    { _id: new ObjectId(tournamentId) },
    { $set: { phase: 'categories', updatedAt: now } }
  );

  return { created, total, categories };
}

