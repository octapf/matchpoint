import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { generateClassificationMatches, randomizeTeamGroups } from './classificationMatches';
import { generateCategoryMatches } from './categoryMatches';
import { deriveTournamentGroupConfig } from './tournamentConfig';
import { assignCategoriesForDivision, computeStandingsForGroup } from './tournamentStandings';

function tournamentStarted(doc: Record<string, unknown>) {
  const startedAt = (doc as { startedAt?: unknown }).startedAt;
  const phase = String((doc as { phase?: unknown }).phase ?? '');
  return !!startedAt || phase === 'classification' || phase === 'categories' || phase === 'completed';
}

export async function actionRandomizeGroups(db: Db, tournamentId: string) {
  return randomizeTeamGroups(db, tournamentId);
}

export async function actionStartTournament(
  db: Db,
  tournamentId: string,
  params: { matchesPerOpponent?: unknown }
): Promise<{ startedAt: string; matches: { created: number; total: number } }> {
  const tournaments = db.collection('tournaments');
  const oid = new ObjectId(tournamentId);
  const current = await tournaments.findOne({ _id: oid });
  if (!current) throw new Error('Tournament not found');
  const cur = current as Record<string, unknown>;
  if (tournamentStarted(cur)) throw new Error('Tournament already started');

  const matchesPerOpponentRaw = Number(
    params.matchesPerOpponent ?? (cur as { classificationMatchesPerOpponent?: unknown }).classificationMatchesPerOpponent ?? 1
  );
  const matchesPerOpponent = Math.max(1, Math.min(5, Math.floor(matchesPerOpponentRaw) || 1));
  const pointsToWin = Math.max(1, Math.min(99, Number((cur as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Number((cur as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

  const now = new Date().toISOString();

  // Phase transition is atomic: only one caller can flip it.
  const transitioned = await tournaments.findOneAndUpdate(
    {
      _id: oid,
      $and: [
        { phase: { $in: [null, 'registration'] } },
        { $or: [{ startedAt: null }, { startedAt: { $exists: false } }] },
      ],
    },
    {
      $set: {
        phase: 'classification',
        startedAt: now,
        classificationMatchesPerOpponent: matchesPerOpponent,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );
  if (!transitioned) throw new Error('Tournament already started');

  // Clear previous classification matches only after successful transition.
  await db.collection('matches').deleteMany({ tournamentId: tournamentId, stage: 'classification' });

  const gen = await generateClassificationMatches(db, tournamentId, {
    matchesPerOpponent,
    pointsToWin,
    setsPerMatch,
  });

  return { startedAt: now, matches: gen };
}

export async function actionPublishCategoryMatches(db: Db, tournamentId: string, opts?: { actorId?: string }) {
  // generateCategoryMatches already validates phase and completion; keep wrapper for consistency.
  return generateCategoryMatches(db, tournamentId, opts);
}

export async function actionFinalizeClassification(db: Db, tournamentId: string, opts?: { actorId?: string }) {
  const tournaments = db.collection('tournaments');
  const oid = new ObjectId(tournamentId);
  const current = await tournaments.findOne({ _id: oid });
  if (!current) throw new Error('Tournament not found');
  const phase = String((current as { phase?: unknown }).phase ?? '');
  if (phase === 'categories' || phase === 'completed') {
    return { ok: true, alreadyFinalized: true };
  }
  if (phase !== 'classification') {
    throw new Error('Tournament is not in classification phase');
  }

  const matchesCol = db.collection('matches');
  const remaining = await matchesCol.countDocuments({
    tournamentId,
    stage: 'classification',
    status: { $ne: 'completed' },
  });
  if (remaining > 0) {
    throw new Error('Classification is not completed');
  }

  // Persist snapshot before generating category matches (deterministic history).
  const teams = await db
    .collection('teams')
    .find({ tournamentId })
    .project({ _id: 1, name: 1, groupIndex: 1 })
    .toArray();
  const matches = await db
    .collection('matches')
    .find({ tournamentId, stage: 'classification' })
    .project({ groupIndex: 1, teamAId: 1, teamBId: 1, status: 1, winnerId: 1, pointsA: 1, pointsB: 1 })
    .toArray();

  const cfg = (await tournaments.findOne({ _id: oid })) as Record<string, unknown> | null;
  if (!cfg) throw new Error('Tournament not found');
  const groupCfg = deriveTournamentGroupConfig(cfg as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });
  const divisions = groupCfg.divisions.length ? groupCfg.divisions : (['mixed'] as const);

  const byGroup = new Map<number, { _id: string; name: string }[]>();
  for (const tm of teams as unknown as Array<{ _id: ObjectId; name?: unknown; groupIndex?: unknown }>) {
    const gi = typeof tm.groupIndex === 'number' && Number.isFinite(tm.groupIndex) ? tm.groupIndex : 0;
    const list = byGroup.get(gi) ?? [];
    list.push({ _id: tm._id.toString(), name: String(tm.name ?? '') });
    byGroup.set(gi, list);
  }

  const snapshotDivisions = divisions.map((division, di) => {
    const base = groupCfg.divisionGroupOffset(di);
    const perDiv = groupCfg.groupsPerDivision(di);
    const groups = Array.from({ length: perDiv }, (_, i) => {
      const gi = base + i;
      const groupTeams = byGroup.get(gi) ?? [];
      const groupMatches = matches.filter((m) => Number((m as { groupIndex?: unknown }).groupIndex ?? -1) === gi);
        return {
          groupIndex: gi,
          standings: computeStandingsForGroup({
            teams: groupTeams,
            matches: groupMatches as any,
            tieBreakSeed: tournamentId,
          }),
        };
    });
    return { division, groups };
  });

  const categories = Array.isArray((cfg as { categories?: unknown }).categories)
    ? ((cfg as { categories?: unknown }).categories as unknown[]).filter((c): c is 'Gold' | 'Silver' | 'Bronze' => c === 'Gold' || c === 'Silver' || c === 'Bronze')
    : [];
  const categoryFractions =
    (cfg as { categoryFractions?: unknown }).categoryFractions && typeof (cfg as { categoryFractions?: unknown }).categoryFractions === 'object'
      ? ((cfg as { categoryFractions?: unknown }).categoryFractions as Partial<Record<'Gold' | 'Silver' | 'Bronze', number>>)
      : null;
  const singleCategoryAdvanceFractionRaw = Number((cfg as { singleCategoryAdvanceFraction?: unknown }).singleCategoryAdvanceFraction ?? 0.5);
  const singleCategoryAdvanceFraction = Number.isFinite(singleCategoryAdvanceFractionRaw) ? singleCategoryAdvanceFractionRaw : 0.5;

  const teamCategory: Record<string, string> = {};
  for (let di = 0; di < divisions.length; di++) {
    const div = divisions[di]!;
    const groups = snapshotDivisions[di]?.groups ?? [];
    const standingsByGroup = groups.map((g) => g.standings);
    const assigned = assignCategoriesForDivision({
      standingsByGroup,
      categories: categories as any,
      categoryFractions: categoryFractions as any,
      singleCategoryAdvanceFraction,
      tieBreakSeed: tournamentId,
    });
    for (const [tid, cat] of assigned.teamCategory.entries()) {
      teamCategory[tid] = cat;
    }
    // eliminated are simply omitted for now
    void div;
  }

  const now = new Date().toISOString();
  await tournaments.updateOne(
    { _id: oid },
    {
      $set: {
        classificationSnapshot: {
          computedAt: now,
          divisions: snapshotDivisions,
          teamCategory,
        },
        updatedAt: now,
      },
    }
  );

  const result = await generateCategoryMatches(db, tournamentId, { actorId: opts?.actorId });
  return { ok: true, ...result };
}

