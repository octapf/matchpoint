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
  const r = await randomizeTeamGroups(db, tournamentId);

  // Creating/reorganizing groups also (re)generates classification matches so the schedule is ready
  // before the organizer starts the tournament (referees can only start matches after start).
  const tournaments = db.collection('tournaments');
  const t = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const doc = t as Record<string, unknown>;

  const matchesPerOpponentRaw = Number((doc as { classificationMatchesPerOpponent?: unknown }).classificationMatchesPerOpponent ?? 1);
  const matchesPerOpponent = Math.max(1, Math.min(5, Math.floor(matchesPerOpponentRaw) || 1));
  const pointsToWin = Math.max(1, Math.min(99, Number((doc as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Number((doc as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

  // Defensive cleanup: category brackets must be created only after classification completes.
  // If stale category matches exist (e.g. from a previous run), wipe them when groups are (re)created.
  await db.collection('matches').deleteMany({ tournamentId, stage: 'category' });
  await db.collection('teams').updateMany({ tournamentId }, { $unset: { category: '' } });
  await db.collection('tournaments').updateOne(
    { _id: new ObjectId(tournamentId) },
    { $unset: { categoriesSnapshot: '' } }
  );

  await db.collection('matches').deleteMany({ tournamentId, stage: 'classification' });
  const gen = await generateClassificationMatches(db, tournamentId, {
    matchesPerOpponent,
    pointsToWin,
    setsPerMatch,
  });

  return { ...r, matches: gen };
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

  // Only allow starting on tournament day, and only when the roster is full.
  const startDateRaw = String((cur as { startDate?: unknown }).startDate ?? (cur as { date?: unknown }).date ?? '');
  const tournamentIsoDate = startDateRaw ? startDateRaw.slice(0, 10) : '';
  const todayLocal = new Date();
  const todayIsoDate = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
  if (!tournamentIsoDate || tournamentIsoDate !== todayIsoDate) {
    throw new Error('Tournament can only be started on its scheduled date');
  }
  const teamsColForCount = db.collection('teams');
  const maxT = Math.max(2, Math.floor(Number((cur as { maxTeams?: unknown }).maxTeams ?? 0) || 0));
  const teamsCount = await teamsColForCount.countDocuments({ tournamentId });
  if (teamsCount < maxT) {
    throw new Error('Tournament can only be started when team cap is reached');
  }

  const groupsDistributedAt = (cur as { groupsDistributedAt?: unknown }).groupsDistributedAt;
  if (groupsDistributedAt === null) {
    const teamsCol = db.collection('teams');
    const maxT = Number((cur as { maxTeams?: unknown }).maxTeams);
    const allTeams = await teamsCol.find({ tournamentId }).toArray();
    const allPlaced =
      Number.isFinite(maxT) &&
      allTeams.length === maxT &&
      allTeams.every((tm) => {
        const gi = (tm as { groupIndex?: unknown }).groupIndex;
        return typeof gi === 'number' && gi >= 0;
      });
    if (!allPlaced) {
      throw new Error('Distribute teams into groups before starting');
    }
  }

  const matchesPerOpponentRaw = Number(
    params.matchesPerOpponent ?? (cur as { classificationMatchesPerOpponent?: unknown }).classificationMatchesPerOpponent ?? 1
  );
  const matchesPerOpponent = Math.max(1, Math.min(5, Math.floor(matchesPerOpponentRaw) || 1));

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

  // Matches are normally created when the organizer creates groups. Keep a safe fallback for older tournaments.
  const matchesCol = db.collection('matches');
  const existing = await matchesCol.countDocuments({ tournamentId, stage: 'classification' });
  if (existing > 0) {
    return { startedAt: now, matches: { created: 0, total: existing } };
  }

  const pointsToWin = Math.max(1, Math.min(99, Number((cur as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Number((cur as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));
  const gen = await generateClassificationMatches(db, tournamentId, { matchesPerOpponent, pointsToWin, setsPerMatch });

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
  for (const tm of teams as unknown as { _id: ObjectId; name?: unknown; groupIndex?: unknown }[]) {
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

