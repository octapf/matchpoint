import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { Match, TournamentCategory, TournamentDivision } from '../../types';
import { teamGroupIndex } from '../../lib/tournamentGroups';
import { computeStandingsForGroup, assignCategoriesForDivision } from './tournamentStandings';
import { deriveTournamentGroupConfig } from './tournamentConfig';
import { planCategorySingleElimination } from './singleElimBracket';
import { insertAuditLogSafe } from './auditLog';
import { notifyPlayersEnteredCategoryPhase } from './categoryPhaseNotify';

const CATEGORY_GENERATION_LOCK_STALE_MS = 10 * 60_000;

export async function generateCategoryMatches(
  db: Db,
  tournamentId: string,
  opts?: { actorId?: string }
): Promise<{ created: number; total: number; categories: TournamentCategory[] }> {
  const tournamentsCol = db.collection('tournaments');
  const teamsCol = db.collection('teams');
  const matchesCol = db.collection('matches');

  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const phase = String((t as { phase?: unknown }).phase ?? '');
  if (phase !== 'classification') throw new Error('Tournament is not in classification phase');

  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });

  const categories = Array.isArray((t as { categories?: unknown }).categories)
    ? ((t as { categories?: unknown }).categories as unknown[])
        .filter((c): c is TournamentCategory => c === 'Gold' || c === 'Silver' || c === 'Bronze')
    : ([] as TournamentCategory[]);

  const categoryFractions =
    (t as { categoryFractions?: unknown }).categoryFractions && typeof (t as { categoryFractions?: unknown }).categoryFractions === 'object'
      ? ((t as { categoryFractions?: unknown }).categoryFractions as Partial<Record<TournamentCategory, number>>)
      : null;
  const categoryCounts =
    (t as { categoryCounts?: unknown }).categoryCounts && typeof (t as { categoryCounts?: unknown }).categoryCounts === 'object'
      ? ((t as { categoryCounts?: unknown }).categoryCounts as Partial<Record<TournamentCategory, number>>)
      : null;
  const singleCategoryAdvanceFractionRaw = Number((t as { singleCategoryAdvanceFraction?: unknown }).singleCategoryAdvanceFraction ?? 0.5);
  const singleCategoryAdvanceFraction = Number.isFinite(singleCategoryAdvanceFractionRaw) ? singleCategoryAdvanceFractionRaw : 0.5;
  const divisionsRaw = Array.isArray((t as { divisions?: unknown }).divisions)
    ? ((t as { divisions?: unknown }).divisions as unknown[])
    : [];
  const divisions = divisionsRaw
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d): d is TournamentDivision => d === 'men' || d === 'women' || d === 'mixed');
  const divisionCount = cfg.divisionCount;

  const teams = await teamsCol.find({ tournamentId }).toArray();
  const allMatches = await matchesCol.find({ tournamentId }).toArray();
  const classificationMatches = allMatches.filter((m) => (m as { stage?: unknown }).stage === 'classification');
  if (classificationMatches.length === 0) throw new Error('No classification matches found');
  if (classificationMatches.some((m) => (m as { status?: unknown }).status !== 'completed')) {
    throw new Error('Classification is not completed');
  }

  const categoryBracketLocked = await matchesCol.countDocuments({
    tournamentId,
    stage: 'category',
    status: { $in: ['in_progress', 'completed'] },
  });
  if (categoryBracketLocked > 0) {
    throw new Error(
      'Category bracket is locked: at least one category match is in progress or completed; cannot regenerate.'
    );
  }

  const lockId = new ObjectId().toString();
  const lockNow = new Date().toISOString();
  const staleBefore = new Date(Date.parse(lockNow) - CATEGORY_GENERATION_LOCK_STALE_MS).toISOString();
  const lockedTournament = await tournamentsCol.findOneAndUpdate(
    {
      _id: new ObjectId(tournamentId),
      phase: 'classification',
      $or: [
        { categoryGenerationLockId: { $exists: false } },
        { categoryGenerationLockId: null },
        { categoryGenerationStartedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        categoryGenerationLockId: lockId,
        categoryGenerationStartedAt: lockNow,
        updatedAt: lockNow,
      },
    },
    { returnDocument: 'after' }
  );
  if (!lockedTournament) {
    const latest = await tournamentsCol.findOne(
      { _id: new ObjectId(tournamentId) },
      { projection: { phase: 1 } }
    );
    const latestPhase = String((latest as { phase?: unknown } | null)?.phase ?? '');
    if (latestPhase === 'categories' || latestPhase === 'completed') {
      const existingCategoryMatches = await matchesCol.countDocuments({ tournamentId, stage: 'category' });
      return { created: 0, total: existingCategoryMatches, categories };
    }
    throw new Error('Category bracket generation is already in progress');
  }

  // Remove existing category matches before regenerating.
  try {
    await matchesCol.deleteMany({ tournamentId, stage: 'category' });

    const now = new Date().toISOString();
    const baseMs = Date.parse(now);
    let created = 0;
    let total = 0;

    const snapshotDivisions: Array<{
      division: TournamentDivision | string;
      categories: Array<{ category: TournamentCategory; teamIds: string[]; matchIds: string[] }>;
    }> = [];

  for (let di = 0; di < divisionCount; di++) {
    const base = cfg.divisionGroupOffset(di);
    const perDiv = cfg.groupsPerDivision(di);
    const groupIndices = Array.from({ length: perDiv }, (_, i) => base + i);

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
      return computeStandingsForGroup({
        teams: groupTeams,
        matches: groupMatches as any,
        tieBreakSeed: tournamentId,
      });
    });

    const { teamCategory, globalOrder } = assignCategoriesForDivision({
      standingsByGroup,
      categories,
      categoryFractions,
      categoryCounts,
      singleCategoryAdvanceFraction,
      tieBreakSeed: tournamentId,
    });
    const orderRank = new Map(globalOrder.map((tid, i) => [tid, i]));
    const sortTeamIdsByGlobal = (ids: string[]) =>
      [...ids].sort((a, b) => (orderRank.get(a) ?? 1e9) - (orderRank.get(b) ?? 1e9));

    // Persist derived category/division on teams for stability and easier UI.
    const teamsOps: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
    const divKey = divisions[di] ?? cfg.divisions[di] ?? undefined;
    for (const [tid, cat] of teamCategory.entries()) {
      teamsOps.push({
        updateOne: {
          filter: { _id: new ObjectId(tid) },
          update: { $set: { category: cat, division: divKey, updatedAt: now } },
        },
      });
    }
    if (teamsOps.length) {
      await teamsCol.bulkWrite(teamsOps, { ordered: false });
    }

    // Generate single-elimination bracket matches within each category (always bracket).
    const teamsByCategory = new Map<TournamentCategory, string[]>();
    for (const [tid, cat] of teamCategory.entries()) {
      const list = teamsByCategory.get(cat) ?? [];
      list.push(tid);
      teamsByCategory.set(cat, list);
    }

    const pointsToWin = Math.max(1, Math.min(99, Number((t as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
    const setsPerMatch = Math.max(1, Math.min(7, Number((t as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

    const divisionSnapshot = {
      division: (divisions[di] ?? cfg.divisions[di] ?? 'mixed') as TournamentDivision | string,
      categories: [] as Array<{ category: TournamentCategory; teamIds: string[]; matchIds: string[] }>,
    };

    let scheduleSlot = 0;
    for (const [cat, teamIdsRaw] of teamsByCategory.entries()) {
      const teamIds = sortTeamIdsByGlobal(teamIdsRaw);
      if (teamIds.length < 2) continue;
      const matchIds: string[] = [];
      let seq = 0;

      {
        const plans = planCategorySingleElimination(teamIds);
        total += plans.length;
        const idByPlan = new Map<number, string>();
        for (let pi = 0; pi < plans.length; pi++) {
          const plan = plans[pi]!;
          const advA =
            plan.advanceTeamAFromPlanIndex != null ? idByPlan.get(plan.advanceTeamAFromPlanIndex) : undefined;
          const advB =
            plan.advanceTeamBFromPlanIndex != null ? idByPlan.get(plan.advanceTeamBFromPlanIndex) : undefined;
          const advAL =
            plan.advanceTeamALoserFromPlanIndex != null ? idByPlan.get(plan.advanceTeamALoserFromPlanIndex) : undefined;
          const advBL =
            plan.advanceTeamBLoserFromPlanIndex != null ? idByPlan.get(plan.advanceTeamBLoserFromPlanIndex) : undefined;
          const doc: Omit<Match, '_id'> = {
            tournamentId,
            stage: 'category',
            division: divisions[di] ?? undefined,
            groupIndex: undefined,
            category: cat,
            teamAId: plan.teamAId ?? '',
            teamBId: plan.teamBId ?? '',
            setsPerMatch,
            pointsToWin,
            status: 'scheduled',
            orderIndex: seq++,
            scheduledAt: Number.isFinite(baseMs) ? new Date(baseMs + scheduleSlot++ * 60_000).toISOString() : now,
            createdAt: now,
            updatedAt: now,
            bracketRound: plan.bracketRound,
            ...(plan.isBronze ? { isBronzeMatch: true } : {}),
            ...(advA ? { advanceTeamAFromMatchId: advA } : {}),
            ...(advB ? { advanceTeamBFromMatchId: advB } : {}),
            ...(advAL ? { advanceTeamALoserFromMatchId: advAL } : {}),
            ...(advBL ? { advanceTeamBLoserFromMatchId: advBL } : {}),
          };
          const ins = await matchesCol.insertOne(doc as unknown as Record<string, unknown>);
          const mid = ins.insertedId.toString();
          idByPlan.set(pi, mid);
          matchIds.push(mid);
          created++;
        }
      }

      divisionSnapshot.categories.push({ category: cat, teamIds, matchIds });
    }

    snapshotDivisions.push(divisionSnapshot);
  }

    const phaseUpdate = await tournamentsCol.updateOne(
      { _id: new ObjectId(tournamentId), categoryGenerationLockId: lockId },
      {
        $set: {
          phase: 'categories',
          categoriesSnapshot: {
            computedAt: now,
            divisions: snapshotDivisions,
          },
          updatedAt: now,
        },
        $unset: {
          categoryGenerationLockId: '',
          categoryGenerationStartedAt: '',
        },
      }
    );
    if (phaseUpdate.matchedCount === 0) {
      throw new Error('Category generation lock was lost');
    }

    const tournamentName = String((t as { name?: unknown }).name ?? 'Tournament');
    for (const snapDiv of snapshotDivisions) {
      const div = String(snapDiv.division ?? 'mixed');
      for (const c of snapDiv.categories) {
        if (!c.teamIds?.length) continue;
        const cat = c.category;
        if (cat !== 'Gold' && cat !== 'Silver' && cat !== 'Bronze') continue;
        await notifyPlayersEnteredCategoryPhase(db, tournamentId, tournamentName, div, cat, c.teamIds);
      }
    }

    if (opts?.actorId) {
      await insertAuditLogSafe(db, {
        actorId: opts.actorId,
        action: 'tournament.categoryMatches.generated',
        resource: 'tournament',
        resourceId: tournamentId,
        meta: { created, total, categoryPhaseFormat: 'single_elim' as const },
      });
    }

    return { created, total, categories };
  } catch (err) {
    await tournamentsCol.updateOne(
      { _id: new ObjectId(tournamentId), categoryGenerationLockId: lockId },
      {
        $set: { updatedAt: new Date().toISOString() },
        $unset: {
          categoryGenerationLockId: '',
          categoryGenerationStartedAt: '',
        },
      }
    );
    throw err;
  }
}

