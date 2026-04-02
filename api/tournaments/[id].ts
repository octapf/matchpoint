import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { getSessionUserId, isUserAdmin, loadActorUserWithAdminRefresh, resolveActorUserId } from '../../server/lib/auth';
import { normalizeGroupCount, validateTournamentGroups, teamGroupIndex } from '../../lib/tournamentGroups';
import { syncTournamentOpenFullStatus } from '../../server/lib/tournamentStatusSync';
import { deriveTournamentGroupConfig } from '../../server/lib/tournamentConfig';
import { computeStandingsForGroup } from '../../server/lib/tournamentStandings';
import {
  actionFinalizeClassification,
  actionPublishCategoryMatches,
  actionRandomizeGroups,
  actionStartTournament,
} from '../../server/lib/tournamentLifecycle';
import { rebalanceTournamentTeams } from '../../server/lib/rebalanceTournamentTeams';
import { tournamentDivisionsNormalized } from '../../lib/tournamentOrganizerCoverage';
import type { TournamentDivision } from '../../types';
import { assertOrganizersCoverAllDivisions } from '../../server/lib/tournamentOrganizerDivisionCoverage';
import { removePlayerFromTournament } from '../../server/lib/tournamentPlayerRemoval';
import { tournamentPostActionSchema } from '../../server/lib/schemas/tournamentPostAction';
import { notifyMany, notifyOne } from '../../server/lib/notify';
import { applyCategoryKnockoutAdvances } from '../../server/lib/knockoutAdvance';
import { insertAuditLogSafe } from '../../server/lib/auditLog';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

const REFEREE_LOCK_MS = 15_000;

function lockExpiresAtIso(nowMs: number): string {
  return new Date(nowMs + REFEREE_LOCK_MS).toISOString();
}

function lockExpiresAtMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function isRefereeLockActive(match: Record<string, unknown>, nowMs: number): boolean {
  const refereeUserId = typeof (match as any).refereeUserId === 'string' ? String((match as any).refereeUserId) : '';
  const expMs = lockExpiresAtMs((match as any).refereeLockExpiresAt);
  if (!refereeUserId || expMs == null) return false;
  return expMs > nowMs;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  const id = req.query.id as string;
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid tournament ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('tournaments');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });
      const vis = (doc as { visibility?: string }).visibility;
      if (vis === 'private') {
        const actorId = getSessionUserId(req);
        if (!actorId) {
          return corsRes.status(404).json({ error: 'Tournament not found' });
        }
        const actorUser = await loadActorUserWithAdminRefresh(db, actorId);
        const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
        const isOrg = isTournamentOrganizer(doc as { organizerIds?: string[] }, actorId);
        if (!actorIsAdmin && !isOrg) {
          const entriesCol = db.collection('entries');
          const hasEntry = await entriesCol.findOne({ tournamentId: id, userId: actorId });
          if (!hasEntry) {
            return corsRes.status(404).json({ error: 'Tournament not found' });
          }
        }
      }

      const serialized = serializeDoc(doc as Record<string, unknown>)!;

      // Attach the same count fields as the list endpoint so cards and detail stay consistent.
      const entriesCol = db.collection('entries');
      const teamsCol = db.collection('teams');
      const waitCol = db.collection('waitlist');

      const [entriesCount, teamsList, waitByDiv] = await Promise.all([
        entriesCol.countDocuments({ tournamentId: id, teamId: { $ne: null } }),
        teamsCol.find({ tournamentId: id }).project({ groupIndex: 1 }).toArray(),
        waitCol
          .aggregate<{ _id: { division: string }; count: number }>([
            { $match: { tournamentId: id, division: { $in: ['men', 'women', 'mixed'] } } },
            { $group: { _id: { division: '$division' }, count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);
      const waitlistCountByDivision = { men: 0, women: 0, mixed: 0 };
      for (const row of waitByDiv) {
        const div = String(row._id.division);
        if (div === 'men') waitlistCountByDivision.men = row.count;
        else if (div === 'women') waitlistCountByDivision.women = row.count;
        else if (div === 'mixed') waitlistCountByDivision.mixed = row.count;
      }
      const waitlistCount = waitlistCountByDivision.men + waitlistCountByDivision.women + waitlistCountByDivision.mixed;

      const teamsCount = teamsList.length;
      const gc = normalizeGroupCount((serialized as { groupCount?: number }).groupCount);
      const groupsSet = new Set<number>();
      for (const row of teamsList) {
        const gi = teamGroupIndex(row as { groupIndex?: number });
        const clamped = Math.min(gc - 1, Math.max(0, gi));
        groupsSet.add(clamped);
      }

      const includeMatches = String(req.query.includeMatches ?? '') === '1';
      const includeStandings = String(req.query.includeStandings ?? '') === '1';
      let matches: unknown[] | undefined = undefined;
      if (includeMatches) {
        matches = await db
          .collection('matches')
          .find({ tournamentId: id })
          .sort({ createdAt: 1, _id: 1 })
          .toArray();
      }

      let standings: unknown | undefined = undefined;
      let fixture: unknown | undefined = undefined;
      if (includeStandings) {
        const teams = await db
          .collection('teams')
          .find({ tournamentId: id })
          .project({ _id: 1, name: 1, groupIndex: 1, division: 1, category: 1 })
          .toArray();

        const classificationMatches = await db
          .collection('matches')
          .find({ tournamentId: id, stage: 'classification' })
          .project({ _id: 1, groupIndex: 1, teamAId: 1, teamBId: 1, status: 1, winnerId: 1, pointsA: 1, pointsB: 1 })
          .toArray();

        const cfg = deriveTournamentGroupConfig(doc as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });
        const divisions = cfg.divisions.length ? cfg.divisions : (['mixed'] as const);

        const byGroup = new Map<number, { _id: string; name: string }[]>();
        for (const tm of teams as unknown as Array<{ _id: ObjectId; name?: unknown; groupIndex?: unknown }>) {
          const gi = teamGroupIndex({ groupIndex: typeof tm.groupIndex === 'number' ? tm.groupIndex : 0 });
          const list = byGroup.get(gi) ?? [];
          list.push({ _id: tm._id.toString(), name: String(tm.name ?? '') });
          byGroup.set(gi, list);
        }

        standings = divisions.map((division, di) => {
          const base = cfg.divisionGroupOffset(di);
          const perDiv = cfg.groupsPerDivision(di);
          const groups = Array.from({ length: perDiv }, (_, i) => {
            const gi = base + i;
            const groupTeams = byGroup.get(gi) ?? [];
            const groupMatches = classificationMatches.filter(
              (m) => Number((m as { groupIndex?: unknown }).groupIndex ?? -1) === gi
            );
            return {
              groupIndex: gi,
              standings: computeStandingsForGroup({
                teams: groupTeams,
                matches: groupMatches as any,
                tieBreakSeed: id,
              }),
            };
          });
          return { division, groups };
        });

        const allMatches = await db
          .collection('matches')
          .find({ tournamentId: id })
          .project({
            _id: 1,
            stage: 1,
            division: 1,
            groupIndex: 1,
            category: 1,
            teamAId: 1,
            teamBId: 1,
            status: 1,
            setsWonA: 1,
            setsWonB: 1,
            pointsA: 1,
            pointsB: 1,
            winnerId: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .sort({ createdAt: 1, _id: 1 })
          .toArray();

        fixture = {
          classification: divisions.map((division, di) => {
            const base = cfg.divisionGroupOffset(di);
            const perDiv = cfg.groupsPerDivision(di);
            const groups = Array.from({ length: perDiv }, (_, i) => {
              const gi = base + i;
              const matches = allMatches.filter(
                (m) =>
                  (m as { stage?: unknown }).stage === 'classification' &&
                  Number((m as { groupIndex?: unknown }).groupIndex ?? -1) === gi
              );
              return { groupIndex: gi, matches: matches.map((m) => serializeDoc(m as Record<string, unknown>)) };
            });
            return { division, groups };
          }),
          categories: divisions.map((division, di) => {
            const matches = allMatches.filter(
              (m) => (m as { stage?: unknown }).stage === 'category' && String((m as { division?: unknown }).division ?? '') === division
            );
            const byCategory: Record<string, unknown[]> = { Gold: [], Silver: [], Bronze: [] };
            for (const m of matches) {
              const c = String((m as { category?: unknown }).category ?? '');
              if (c === 'Gold' || c === 'Silver' || c === 'Bronze') byCategory[c].push(serializeDoc(m as Record<string, unknown>));
            }
            return { division, byCategory };
          }),
        };
      }

      return corsRes.status(200).json({
        ...serialized,
        entriesCount,
        teamsCount,
        groupsWithTeamsCount: groupsSet.size,
        waitlistCount,
        waitlistCountByDivision,
        ...(includeMatches ? { matches: (matches ?? []).map((m) => serializeDoc(m as Record<string, unknown>)) } : null),
        ...(includeStandings ? { standings, fixture } : null),
      });
    }

    if (req.method === 'POST') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const current = await col.findOne({ _id: oid });
      if (!current) return corsRes.status(404).json({ error: 'Tournament not found' });
      const cur = current as Record<string, unknown>;
      const actorUser = await loadActorUserWithAdminRefresh(db, actingUserId);
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(cur as { organizerIds?: string[] }, actingUserId);
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const postCheck = tournamentPostActionSchema.safeParse(body);
      if (!postCheck.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const action = typeof body?.action === 'string' ? body.action.trim() : '';

      // Most actions are organizer/admin only, but match refereeing is allowed for players.
      if (action !== 'updateMatch' && action !== 'claimReferee') {
        if (!isOrg && !actorIsAdmin) {
          return corsRes.status(403).json({ error: 'Only organizers can manage this tournament' });
        }
      }

      if (action === 'randomizeGroups') {
        const result = await actionRandomizeGroups(db, id);
        return corsRes.status(200).json(result);
      }

      if (action === 'rebalanceGroups') {
        const result = await rebalanceTournamentTeams(db, id);
        return corsRes.status(200).json(result);
      }

      if (action === 'start') {
        try {
          const result = await actionStartTournament(db, id, { matchesPerOpponent: body?.matchesPerOpponent });
          return corsRes.status(200).json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not start tournament';
          return corsRes.status(400).json({ error: msg });
        }
      }

      if (action === 'generateCategoryMatches') {
        try {
          const result = await actionPublishCategoryMatches(db, id, { actorId: actingUserId });
          return corsRes.status(200).json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not generate category matches';
          return corsRes.status(400).json({ error: msg });
        }
      }

      if (action === 'finalizeClassification') {
        try {
          const remaining = await db
            .collection('matches')
            .countDocuments({ tournamentId: id, stage: 'classification', status: { $ne: 'completed' } });
          if (remaining > 0) {
            return corsRes.status(400).json({ error: 'Classification is not completed', remaining });
          }
          const result = await actionFinalizeClassification(db, id, { actorId: actingUserId });

          await insertAuditLogSafe(db, {
            actorId: actingUserId,
            action: 'tournament.classification.finalized',
            resource: 'tournament',
            resourceId: id,
            meta: {
              categoryMatchesCreated: 'created' in result ? result.created : 0,
              alreadyFinalized: 'alreadyFinalized' in result ? result.alreadyFinalized : false,
            },
          });

          // Notify players about classification category (best-effort, de-duped).
          const tdoc = await db.collection('tournaments').findOne({ _id: oid }, { projection: { name: 1, classificationSnapshot: 1 } });
          const tournamentName = String((tdoc as any)?.name ?? '');
          const snap = (tdoc as any)?.classificationSnapshot as { teamCategory?: Record<string, string> } | undefined;
          const teamCategory = snap?.teamCategory ?? {};
          const teamIds = Object.keys(teamCategory).filter(Boolean);
          if (teamIds.length) {
            const teams = await db
              .collection('teams')
              .find({ tournamentId: id, _id: { $in: teamIds.map((s) => new ObjectId(s)) } })
              .project({ _id: 1, playerIds: 1 })
              .toArray();
            const teamPlayers = new Map<string, string[]>();
            for (const tm of teams as any[]) {
              teamPlayers.set(String(tm._id), Array.isArray(tm.playerIds) ? tm.playerIds.map(String).filter(Boolean) : []);
            }
            await Promise.all(
              teamIds.map(async (tid) => {
                const cat = String((teamCategory as any)[tid] ?? '');
                const pids = teamPlayers.get(tid) ?? [];
                if (!cat || pids.length === 0) return;
                await notifyMany(db, pids, {
                  type: 'tournament.classified',
                  params: { tournament: tournamentName || 'Tournament', category: cat },
                  data: { tournamentId: id, teamId: tid },
                  dedupeKey: `tournament.classified:${id}:${tid}:${cat}`,
                });
              })
            );
          }
          return corsRes.status(200).json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not finalize classification';
          return corsRes.status(400).json({ error: msg });
        }
      }

      if (action === 'removePlayer') {
        const uid = typeof body?.userId === 'string' ? body.userId.trim() : '';
        if (!uid || !ObjectId.isValid(uid)) {
          return corsRes.status(400).json({ error: 'Invalid userId' });
        }
        const mode = body?.mode === 'dissolveToWaitlist' || body?.mode === 'removeFromTournament' ? body.mode : 'removeFromTournament';
        // organizer/admin only (enforced by action guard above)
        await removePlayerFromTournament(db, id, uid, { leaveTournament: mode === 'removeFromTournament' });
        await syncTournamentOpenFullStatus(db, id);
        return corsRes.status(200).json({ ok: true });
      }

      if (action === 'updateMatch') {
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) {
          return corsRes.status(400).json({ error: 'Invalid matchId' });
        }
        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }
        const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
        const prevScheduledAt = String((match as any).scheduledAt ?? '');
        const refereeUserId = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');

        // Permission:
        // - organizers/admins can always edit
        // - otherwise, only the claimed referee can edit while match is in progress
        // - completed matches are admin/organizer only
        if (matchStatus === 'completed' && !actorIsAdmin && !isOrg) {
          return corsRes.status(403).json({ error: 'Only organizers can edit completed matches' });
        }
        if (!actorIsAdmin && !isOrg) {
          if (!refereeUserId || refereeUserId !== actingUserId) {
            return corsRes.status(403).json({ error: 'Only the referee can update the score while the match is on' });
          }
        }

        const nextStatus = typeof body?.status === 'string' ? String(body.status) : undefined;
        const finalize = nextStatus === 'completed' || body?.finalize === true;

        const setsWonA = body?.setsWonA != null ? Number(body.setsWonA) : undefined;
        const setsWonB = body?.setsWonB != null ? Number(body.setsWonB) : undefined;
        const pointsA = body?.pointsA != null ? Number(body.pointsA) : undefined;
        const pointsB = body?.pointsB != null ? Number(body.pointsB) : undefined;

        if (setsWonA != null && (!Number.isFinite(setsWonA) || setsWonA < 0)) {
          return corsRes.status(400).json({ error: 'Invalid setsWonA' });
        }
        if (setsWonB != null && (!Number.isFinite(setsWonB) || setsWonB < 0)) {
          return corsRes.status(400).json({ error: 'Invalid setsWonB' });
        }
        if (pointsA != null && (!Number.isFinite(pointsA) || pointsA < 0)) {
          return corsRes.status(400).json({ error: 'Invalid pointsA' });
        }
        if (pointsB != null && (!Number.isFinite(pointsB) || pointsB < 0)) {
          return corsRes.status(400).json({ error: 'Invalid pointsB' });
        }
        const stage = String((match as { stage?: unknown }).stage ?? '');
        const division = String((match as { division?: unknown }).division ?? '');
        const groupIndex = (match as { groupIndex?: unknown }).groupIndex;
        const category = String((match as { category?: unknown }).category ?? '');
        if (stage !== 'classification' && stage !== 'category') {
          return corsRes.status(400).json({ error: 'Invalid match stage' });
        }
        if (!division || (division !== 'men' && division !== 'women' && division !== 'mixed')) {
          return corsRes.status(400).json({ error: 'Match division is missing' });
        }
        if (stage === 'classification' && !(typeof groupIndex === 'number' && Number.isFinite(groupIndex) && groupIndex >= 0)) {
          return corsRes.status(400).json({ error: 'Classification matches must have a groupIndex' });
        }
        if (stage === 'category' && category && category !== 'Gold' && category !== 'Silver' && category !== 'Bronze') {
          return corsRes.status(400).json({ error: 'Invalid match category' });
        }
        if (stage === 'category' && !category) {
          return corsRes.status(400).json({ error: 'Category matches must have a category' });
        }
        const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
        const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');
        const hasTeamA = ObjectId.isValid(teamAId);
        const hasTeamB = ObjectId.isValid(teamBId);

        if (stage === 'category') {
          const tdoc = await db.collection('tournaments').findOne({ _id: oid }, { projection: { categoriesSnapshot: 1 } });
          const snap = (tdoc as { categoriesSnapshot?: unknown } | null)?.categoriesSnapshot as
            | {
                divisions?: { division: string; categories: { category: string; matchIds: string[] }[] }[];
              }
            | undefined;
          const snapDiv = snap?.divisions?.find((d) => d.division === division);
          const snapCat = snapDiv?.categories?.find((c) => c.category === category);
          if (snapCat?.matchIds?.length && !snapCat.matchIds.includes(matchId)) {
            return corsRes.status(400).json({ error: 'Category match not in published bracket snapshot' });
          }

          const advAW = String((match as { advanceTeamAFromMatchId?: unknown }).advanceTeamAFromMatchId ?? '');
          const advBW = String((match as { advanceTeamBFromMatchId?: unknown }).advanceTeamBFromMatchId ?? '');
          const advAL = String((match as { advanceTeamALoserFromMatchId?: unknown }).advanceTeamALoserFromMatchId ?? '');
          const advBL = String((match as { advanceTeamBLoserFromMatchId?: unknown }).advanceTeamBLoserFromMatchId ?? '');
          const sideAOk = hasTeamA || !!advAW || !!advAL;
          const sideBOk = hasTeamB || !!advBW || !!advBL;
          if (!sideAOk || !sideBOk) {
            return corsRes.status(400).json({ error: 'Invalid category match slots' });
          }

          const verifyTeam = async (tid: string) => {
            const row = await db
              .collection('teams')
              .findOne({ tournamentId: id, _id: new ObjectId(tid) }, { projection: { _id: 1, division: 1, category: 1 } });
            if (!row) return 'Category match team not found' as const;
            if (String((row as { division?: unknown }).division ?? '') !== division) return 'Category match division mismatch' as const;
            if (String((row as { category?: unknown }).category ?? '') !== category) return 'Category match category mismatch' as const;
            return null;
          };
          if (hasTeamA) {
            const err = await verifyTeam(teamAId);
            if (err) return corsRes.status(400).json({ error: err });
          }
          if (hasTeamB) {
            const err = await verifyTeam(teamBId);
            if (err) return corsRes.status(400).json({ error: err });
          }
        }

        const now = new Date().toISOString();
        const update: Record<string, unknown> = { updatedAt: now };
        if (setsWonA != null) update.setsWonA = Math.floor(setsWonA);
        if (setsWonB != null) update.setsWonB = Math.floor(setsWonB);
        if (pointsA != null) update.pointsA = Math.floor(pointsA);
        if (pointsB != null) update.pointsB = Math.floor(pointsB);

        if (matchStatus === 'scheduled' && (refereeUserId || actorIsAdmin || isOrg)) {
          // If organizer/admin starts updating without an explicit claim, treat as in_progress.
          update.status = 'in_progress';
          if (!(match as { startedAt?: unknown }).startedAt) update.startedAt = now;
        }

        if (finalize) {
          if (!hasTeamA || !hasTeamB) {
            return corsRes.status(400).json({ error: 'Both teams must be assigned before completing this match' });
          }
          if (!Number.isFinite(setsWonA) || !Number.isFinite(setsWonB) || setsWonA! < 0 || setsWonB! < 0) {
            return corsRes.status(400).json({ error: 'Invalid setsWonA/setsWonB' });
          }
          if (!Number.isFinite(pointsA) || !Number.isFinite(pointsB) || (pointsA as number) < 0 || (pointsB as number) < 0) {
            return corsRes.status(400).json({ error: 'Points are required to complete a match' });
          }
          const winnerId = setsWonA === setsWonB ? '' : setsWonA! > setsWonB! ? teamAId : teamBId;
          if (!winnerId) return corsRes.status(400).json({ error: 'Matches cannot end in a tie' });
          update.winnerId = winnerId;
          update.status = 'completed';
          update.completedAt = now;
          const startedAt = String((match as { startedAt?: unknown }).startedAt ?? '');
          if (startedAt) {
            const durSec = Math.max(0, Math.floor((Date.parse(now) - Date.parse(startedAt)) / 1000));
            update.durationSeconds = durSec;
          }
        }
        const result = await db
          .collection('matches')
          .findOneAndUpdate({ _id: matchOid }, { $set: update }, { returnDocument: 'after' });
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });

        // Notifications: schedule changes + match completion.
        const updated = result as any;
        const tournamentName = String((await db.collection('tournaments').findOne({ _id: oid }, { projection: { name: 1 } }))?.name ?? '');
        const teamA = hasTeamA
          ? await db.collection('teams').findOne({ _id: new ObjectId(teamAId) }, { projection: { name: 1, playerIds: 1 } })
          : null;
        const teamB = hasTeamB
          ? await db.collection('teams').findOne({ _id: new ObjectId(teamBId) }, { projection: { name: 1, playerIds: 1 } })
          : null;
        const aPlayers: string[] = Array.isArray((teamA as any)?.playerIds) ? (teamA as any).playerIds.map(String).filter(Boolean) : [];
        const bPlayers: string[] = Array.isArray((teamB as any)?.playerIds) ? (teamB as any).playerIds.map(String).filter(Boolean) : [];
        const aName = String((teamA as any)?.name ?? 'TBD');
        const bName = String((teamB as any)?.name ?? 'TBD');

        const nextScheduledAt = String((updated as any).scheduledAt ?? '');
        if (nextScheduledAt && nextScheduledAt !== prevScheduledAt) {
          await notifyMany(db, aPlayers, {
            type: 'match.scheduled',
            params: { opponent: bName },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.scheduled:${matchId}:${nextScheduledAt}:A`,
          });
          await notifyMany(db, bPlayers, {
            type: 'match.scheduled',
            params: { opponent: aName },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.scheduled:${matchId}:${nextScheduledAt}:B`,
          });
        }

        const prevStatus = matchStatus;
        const nextStatusDoc = String((updated as any).status ?? '');
        if (prevStatus !== 'completed' && nextStatusDoc === 'completed') {
          const winnerId = String((updated as any).winnerId ?? '');
          const aResult = winnerId === teamAId ? 'W' : winnerId === teamBId ? 'L' : '';
          const bResult = winnerId === teamBId ? 'W' : winnerId === teamAId ? 'L' : '';
          await notifyMany(db, aPlayers, {
            type: 'match.ended',
            params: { opponent: bName, result: aResult || '-' },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.ended:${matchId}`,
          });
          await notifyMany(db, bPlayers, {
            type: 'match.ended',
            params: { opponent: aName, result: bResult || '-' },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.ended:${matchId}:b`,
          });
          if (stage === 'category' && winnerId && hasTeamA && hasTeamB) {
            const loserId = winnerId === teamAId ? teamBId : teamAId;
            await applyCategoryKnockoutAdvances(db, id, matchId, winnerId, loserId, now);
          }
        }

        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'claimReferee') {
        console.log('[tournaments.action] claimReferee', { tournamentId: id, actingUserId });
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) {
          return corsRes.status(400).json({ error: 'Invalid matchId' });
        }
        const mode = body?.mode === 'takeover' ? 'takeover' : 'claim';
        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }
        const stage = String((match as { stage?: unknown }).stage ?? '');
        const division = String((match as { division?: unknown }).division ?? '');
        const groupIndex = (match as { groupIndex?: unknown }).groupIndex;
        const category = String((match as { category?: unknown }).category ?? '');
        const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
        const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');

        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();

        const currentRef = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
        const currentLockExp = String((match as any).refereeLockExpiresAt ?? '');
        const lockActive = isRefereeLockActive(match as any, nowMs);

        // Determine actor's team (if any). Non-organizers must have a team to referee.
        const actorTeam = await db
          .collection('teams')
          .findOne(
            { tournamentId: id, playerIds: actingUserId },
            { projection: { _id: 1, division: 1, category: 1, groupIndex: 1, playerIds: 1 } }
          );
        const actorTeamId = actorTeam ? (actorTeam as { _id: ObjectId })._id.toString() : '';
        if (actorTeamId && (actorTeamId === teamAId || actorTeamId === teamBId)) {
          return corsRes.status(400).json({ error: 'Playing teams cannot referee their own match' });
        }

        // Locked by someone else and still active: only organizer/admin OR referee's teammate can takeover.
        if (currentRef && currentRef !== actingUserId && lockActive) {
          if (mode !== 'takeover') {
            return corsRes.status(409).json({
              error: 'Match is locked by another referee',
              refereeUserId: currentRef,
              refereeLockExpiresAt: currentLockExp || null,
            });
          }
          if (!actorIsAdmin && !isOrg) {
            // Only the other player on the referee team can takeover (same team as current referee).
            const refTeam = await db
              .collection('teams')
              .findOne({ tournamentId: id, playerIds: currentRef }, { projection: { _id: 1 } });
            const refTeamId = refTeam ? (refTeam as { _id: ObjectId })._id.toString() : '';
            if (!refTeamId || !actorTeamId || refTeamId !== actorTeamId) {
              return corsRes.status(409).json({
                error: 'Match is locked by another referee',
                refereeUserId: currentRef,
                refereeLockExpiresAt: currentLockExp || null,
              });
            }
          }
        }

        // If not org/admin, must be a registered team to referee.
        if (!actorIsAdmin && !isOrg) {
          if (!actorTeam) return corsRes.status(403).json({ error: 'Only registered teams can act as referees' });
        }

        const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
        if (mode === 'takeover' && matchStatus === 'in_progress') {
          const update: Record<string, unknown> = {
            updatedAt: now,
            refereeUserId: actingUserId,
            refereeLockExpiresAt: lockExpiresAtIso(nowMs),
          };
          const result = await db
            .collection('matches')
            .findOneAndUpdate({ _id: matchOid }, { $set: update }, { returnDocument: 'after' });
          if (!result) return corsRes.status(404).json({ error: 'Match not found' });
          return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
        }

        if (stage === 'classification') {
          if (!(typeof groupIndex === 'number' && Number.isFinite(groupIndex) && groupIndex >= 0)) {
            return corsRes.status(400).json({ error: 'Classification matches must have a groupIndex' });
          }
          if (actorTeam && Number((actorTeam as { groupIndex?: unknown }).groupIndex ?? -1) !== Number(groupIndex)) {
            return corsRes.status(403).json({ error: 'Referee team must belong to the same group' });
          }
        } else if (stage === 'category') {
          if (!category) return corsRes.status(400).json({ error: 'Category matches must have a category' });
          if (actorTeam && String((actorTeam as { category?: unknown }).category ?? '') !== category) {
            return corsRes.status(403).json({ error: 'Referee team must belong to the same category' });
          }
        } else {
          return corsRes.status(400).json({ error: 'Invalid match stage' });
        }

        if (
          actorTeam &&
          division &&
          String((actorTeam as { division?: unknown }).division ?? '') &&
          String((actorTeam as { division?: unknown }).division ?? '') !== division
        ) {
          return corsRes.status(403).json({ error: 'Referee team must belong to the same division' });
        }

        // Team must not be playing any in-progress match.
        if (actorTeamId) {
          const inProgress = await db.collection('matches').countDocuments({
            tournamentId: id,
            status: 'in_progress',
            $or: [{ teamAId: actorTeamId }, { teamBId: actorTeamId }],
          });
          if (inProgress > 0) return corsRes.status(400).json({ error: 'Referee team is currently playing a match' });
        }

        // Team must not be about to play in the next scheduled matches for this slice.
        const sliceFilter: Record<string, unknown> = {
          tournamentId: id,
          status: 'scheduled',
          stage,
        };
        if (division) sliceFilter.division = division;
        if (stage === 'classification') sliceFilter.groupIndex = groupIndex;
        if (stage === 'category') sliceFilter.category = category;
        const upcoming = await db
          .collection('matches')
          .find(sliceFilter)
          .project({ teamAId: 1, teamBId: 1, orderIndex: 1, scheduledAt: 1, createdAt: 1 })
          .toArray();
        const next = upcoming
          .sort((a: any, b: any) => {
            const ao = typeof a.orderIndex === 'number' ? a.orderIndex : Number.POSITIVE_INFINITY;
            const bo = typeof b.orderIndex === 'number' ? b.orderIndex : Number.POSITIVE_INFINITY;
            if (ao !== bo) return ao - bo;
            const as = a.scheduledAt ? Date.parse(String(a.scheduledAt)) : Number.POSITIVE_INFINITY;
            const bs = b.scheduledAt ? Date.parse(String(b.scheduledAt)) : Number.POSITIVE_INFINITY;
            if (as !== bs) return as - bs;
            return Date.parse(String(a.createdAt ?? '')) - Date.parse(String(b.createdAt ?? ''));
          })
          .slice(0, 2);
        const nextTeamIds = new Set<string>();
        for (const m of next as any[]) {
          if (m.teamAId) nextTeamIds.add(String(m.teamAId));
          if (m.teamBId) nextTeamIds.add(String(m.teamBId));
        }
        if (actorTeamId && nextTeamIds.has(actorTeamId)) {
          return corsRes.status(400).json({ error: 'Referee team is about to play a match' });
        }

        // From here, treat as "start as referee": initialize and set in_progress.

        // Initialize serve order on start: A1, B1, A2, B2.
        const [teamA, teamB] = await db
          .collection('teams')
          .find({ tournamentId: id, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
          .project({ _id: 1, playerIds: 1 })
          .toArray()
          .then((rows) => {
            const map = new Map<string, any>();
            for (const r of rows as any[]) map.set(String(r._id), r);
            return [map.get(teamAId), map.get(teamBId)];
          });
        const playersA: string[] = Array.isArray(teamA?.playerIds) ? teamA.playerIds.map(String).filter(Boolean) : [];
        const playersB: string[] = Array.isArray(teamB?.playerIds) ? teamB.playerIds.map(String).filter(Boolean) : [];
        const serveOrder =
          Array.isArray((match as { serveOrder?: unknown }).serveOrder) && ((match as any).serveOrder as unknown[]).length === 4
            ? ((match as any).serveOrder as unknown[]).map(String).filter(Boolean)
            : [playersA[0], playersB[0], playersA[1] ?? playersA[0], playersB[1] ?? playersB[0]].map(String).filter(Boolean);
        const serveIndex = Number((match as { serveIndex?: unknown }).serveIndex ?? 0);
        const idx = Number.isFinite(serveIndex) ? (Math.floor(serveIndex) % 4) : 0;
        const servingPlayerId = String((match as { servingPlayerId?: unknown }).servingPlayerId ?? '') || String(serveOrder[idx] ?? serveOrder[0] ?? '');

        const result = await db.collection('matches').findOneAndUpdate(
          { _id: matchOid, status: { $ne: 'completed' } },
          {
            $set: {
              status: 'in_progress',
              startedAt: (match as { startedAt?: unknown }).startedAt ?? now,
              refereeUserId: actingUserId,
              refereeLockExpiresAt: lockExpiresAtIso(nowMs),
              refereeTeamId: actorTeamId || null,
              serveOrder,
              serveIndex: idx,
              servingPlayerId,
              updatedAt: now,
            },
          },
          { returnDocument: 'after' }
        );
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });
        // Notify referee that they have control.
        const tdoc = await db.collection('tournaments').findOne({ _id: oid }, { projection: { name: 1 } });
        const tournamentName = String((tdoc as any)?.name ?? '');
        await notifyOne(db, {
          userId: actingUserId,
          type: 'match.refereeAssigned',
          params: { tournament: tournamentName || 'Tournament' },
          data: { tournamentId: id, matchId },
          dedupeKey: `match.refereeAssigned:${matchId}:${actingUserId}`,
        });
        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'refereeHeartbeat') {
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) return corsRes.status(400).json({ error: 'Invalid matchId' });
        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }

        const currentRef = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
        const nowMs = Date.now();
        const currentLockExp = String((match as any).refereeLockExpiresAt ?? '');
        // Do not require an *active* lock for the assigned referee — heartbeat exists to renew an expired lock.
        if (!actorIsAdmin && !isOrg && (!currentRef || currentRef !== actingUserId)) {
          return corsRes.status(409).json({
            error: 'Referee changed',
            refereeUserId: currentRef || null,
            refereeLockExpiresAt: currentLockExp || null,
          });
        }

        const now = new Date(nowMs).toISOString();
        const update: Record<string, unknown> = {
          updatedAt: now,
          refereeLockExpiresAt: lockExpiresAtIso(nowMs),
        };
        // Admin/org can "refresh" by taking control if needed.
        if (actorIsAdmin || isOrg) {
          update.refereeUserId = actingUserId;
        }
        const result = await db
          .collection('matches')
          .findOneAndUpdate({ _id: matchOid }, { $set: update }, { returnDocument: 'after' });
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });
        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'startMatch') {
        if (!actorIsAdmin && !isOrg) return corsRes.status(403).json({ error: 'Only organizers can start matches' });
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) return corsRes.status(400).json({ error: 'Invalid matchId' });
        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }
        const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
        if (matchStatus === 'completed') return corsRes.status(400).json({ error: 'Match already completed' });

        const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
        const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');
        if (!teamAId || !teamBId) return corsRes.status(400).json({ error: 'Match missing teams' });

        const [teamA, teamB] = await db
          .collection('teams')
          .find({ tournamentId: id, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
          .project({ _id: 1, playerIds: 1 })
          .toArray()
          .then((rows) => {
            const map = new Map<string, any>();
            for (const r of rows as any[]) map.set(String(r._id), r);
            return [map.get(teamAId), map.get(teamBId)];
          });
        const playersA: string[] = Array.isArray(teamA?.playerIds) ? teamA.playerIds.map(String).filter(Boolean) : [];
        const playersB: string[] = Array.isArray(teamB?.playerIds) ? teamB.playerIds.map(String).filter(Boolean) : [];

        const existingOrder = Array.isArray((match as { serveOrder?: unknown }).serveOrder) ? ((match as any).serveOrder as unknown[]) : [];
        const serveOrder =
          existingOrder.length === 4
            ? existingOrder.map(String).filter(Boolean)
            : [playersA[0], playersB[0], playersA[1] ?? playersA[0], playersB[1] ?? playersB[0]].map(String).filter(Boolean);
        const existingIndex = Number((match as { serveIndex?: unknown }).serveIndex ?? 0);
        const idx = Number.isFinite(existingIndex) ? (Math.floor(existingIndex) % 4) : 0;
        const servingPlayerId = String((match as { servingPlayerId?: unknown }).servingPlayerId ?? '') || String(serveOrder[idx] ?? serveOrder[0] ?? '');

        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();
        const result = await db.collection('matches').findOneAndUpdate(
          { _id: matchOid, status: { $ne: 'completed' } },
          {
            $set: {
              status: 'in_progress',
              startedAt: (match as { startedAt?: unknown }).startedAt ?? now,
              refereeUserId: actingUserId,
              refereeLockExpiresAt: lockExpiresAtIso(nowMs),
              serveOrder,
              serveIndex: idx,
              servingPlayerId,
              updatedAt: now,
            },
          },
          { returnDocument: 'after' }
        );
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });

        // Notifications: match started (both teams) + referee assigned (organizer).
        const tdoc = await db.collection('tournaments').findOne({ _id: oid }, { projection: { name: 1 } });
        const tournamentName = String((tdoc as any)?.name ?? '');
        const ta = await db.collection('teams').findOne({ _id: new ObjectId(teamAId) }, { projection: { name: 1, playerIds: 1 } });
        const tb = await db.collection('teams').findOne({ _id: new ObjectId(teamBId) }, { projection: { name: 1, playerIds: 1 } });
        const aPlayers: string[] = Array.isArray((ta as any)?.playerIds) ? (ta as any).playerIds.map(String).filter(Boolean) : [];
        const bPlayers: string[] = Array.isArray((tb as any)?.playerIds) ? (tb as any).playerIds.map(String).filter(Boolean) : [];
        const aName = String((ta as any)?.name ?? 'Team A');
        const bName = String((tb as any)?.name ?? 'Team B');
        await notifyMany(db, aPlayers, {
          type: 'match.started',
          params: { opponent: bName },
          data: { tournamentId: id, matchId },
          dedupeKey: `match.started:${matchId}:A`,
        });
        await notifyMany(db, bPlayers, {
          type: 'match.started',
          params: { opponent: aName },
          data: { tournamentId: id, matchId },
          dedupeKey: `match.started:${matchId}:B`,
        });
        await notifyOne(db, {
          userId: actingUserId,
          type: 'match.refereeAssigned',
          params: { tournament: tournamentName || 'Tournament' },
          data: { tournamentId: id, matchId },
          dedupeKey: `match.refereeAssigned:${matchId}:${actingUserId}`,
        });

        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'refereePoint') {
        console.log('[tournaments.action] refereePoint', { tournamentId: id, actingUserId });
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) return corsRes.status(400).json({ error: 'Invalid matchId' });
        const side = body?.side === 'A' || body?.side === 'B' ? body.side : '';
        const delta = Number(body?.delta);
        if ((side !== 'A' && side !== 'B') || (delta !== 1 && delta !== -1)) {
          return corsRes.status(400).json({ error: 'Invalid side/delta' });
        }

        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }

        const stage = String((match as { stage?: unknown }).stage ?? '');
        if (stage !== 'classification' && stage !== 'category') return corsRes.status(400).json({ error: 'Invalid match stage' });

        const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
        if (matchStatus !== 'in_progress') {
          return corsRes.status(400).json({ error: 'Match is not in progress' });
        }

        const refereeUserId = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
        const nowMs = Date.now();
        const currentLockExp = String((match as any).refereeLockExpiresAt ?? '');
        // Assigned referee may continue scoring after the lock TTL; each point refreshes the lock.
        if (!actorIsAdmin && !isOrg && (!refereeUserId || refereeUserId !== actingUserId)) {
          return corsRes.status(409).json({
            error: 'Referee changed',
            refereeUserId: refereeUserId || null,
            refereeLockExpiresAt: currentLockExp || null,
          });
        }

        // Basic rate limit (tap spam protection).
        const lastPointAt = String((match as { lastPointAt?: unknown }).lastPointAt ?? '');
        if (lastPointAt) {
          const dt = Date.now() - Date.parse(lastPointAt);
          if (Number.isFinite(dt) && dt >= 0 && dt < 300) {
            console.log('[tournaments.action] refereePoint rate_limited', { tournamentId: id, actingUserId, dtMs: dt });
            return corsRes.status(429).json({ error: 'Too many score updates, slow down' });
          }
        }

        const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
        const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');
        if (!teamAId || !teamBId) return corsRes.status(400).json({ error: 'Match missing teams' });

        const [teamA, teamB] = await db
          .collection('teams')
          .find({ tournamentId: id, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
          .project({ _id: 1, playerIds: 1 })
          .toArray()
          .then((rows) => {
            const map = new Map<string, any>();
            for (const r of rows as any[]) map.set(String(r._id), r);
            return [map.get(teamAId), map.get(teamBId)];
          });
        const playersA: string[] = Array.isArray(teamA?.playerIds) ? teamA.playerIds.map(String).filter(Boolean) : [];
        const playersB: string[] = Array.isArray(teamB?.playerIds) ? teamB.playerIds.map(String).filter(Boolean) : [];
        if (playersA.length < 1 || playersB.length < 1) return corsRes.status(400).json({ error: 'Teams missing players' });

        const tournamentDoc = await db.collection('tournaments').findOne({ _id: new ObjectId(id) }, { projection: { pointsToWin: 1 } });
        const fallbackPts = Math.max(1, Math.min(99, Math.floor(Number((tournamentDoc as { pointsToWin?: unknown })?.pointsToWin ?? 21) || 21)));
        const rawMatchPts = Number((match as { pointsToWin?: unknown }).pointsToWin ?? NaN);
        const pointsToWin =
          Number.isFinite(rawMatchPts) && rawMatchPts >= 1 && rawMatchPts <= 99 ? Math.floor(rawMatchPts) : fallbackPts;
        const curA = Math.max(0, Number((match as { pointsA?: unknown }).pointsA ?? 0) || 0);
        const curB = Math.max(0, Number((match as { pointsB?: unknown }).pointsB ?? 0) || 0);
        const nextA = side === 'A' ? Math.max(0, curA + delta) : curA;
        const nextB = side === 'B' ? Math.max(0, curB + delta) : curB;

        if (delta === 1 && (nextA > pointsToWin || nextB > pointsToWin)) {
          return corsRes.status(400).json({ error: 'Score exceeds points limit' });
        }

        const now = new Date().toISOString();
        const update: Record<string, unknown> = { updatedAt: now, lastPointAt: now, pointsA: nextA, pointsB: nextB };
        // Keep the lock alive for the actor making the update.
        update.refereeLockExpiresAt = lockExpiresAtIso(nowMs);
        if (actorIsAdmin || isOrg) {
          // Admin/org can update score even if they weren't the current referee.
          update.refereeUserId = actingUserId;
        }

        // Initialize global serve state if missing: A1, B1, A2, B2.
        const existingOrder = Array.isArray((match as { serveOrder?: unknown }).serveOrder) ? ((match as any).serveOrder as unknown[]) : [];
        const order =
          existingOrder.length === 4
            ? existingOrder.map(String).filter(Boolean)
            : [playersA[0], playersB[0], playersA[1] ?? playersA[0], playersB[1] ?? playersB[0]].map(String).filter(Boolean);
        if (order.length !== 4) return corsRes.status(400).json({ error: 'Invalid serve order state' });
        // Ensure serveOrder only references players in the two teams.
        const allowedPlayers = new Set([...playersA, ...playersB].map(String).filter(Boolean));
        for (const pid of order) {
          if (!allowedPlayers.has(String(pid))) return corsRes.status(400).json({ error: 'Serve order contains invalid player' });
        }
        update.serveOrder = order;

        let serveIndex = Number((match as { serveIndex?: unknown }).serveIndex ?? 0);
        if (!Number.isFinite(serveIndex) || serveIndex < 0) serveIndex = 0;
        serveIndex = Math.floor(serveIndex) % 4;

        // Advance server ONLY when the receiving team wins the rally (side-out).
        // With our 1→4 global order: indices 0,2 belong to team A; 1,3 belong to team B.
        if (delta === 1) {
          const servingSide: 'A' | 'B' = serveIndex % 2 === 0 ? 'A' : 'B';
          const scoringSide: 'A' | 'B' = side === 'A' ? 'A' : 'B';
          if (scoringSide !== servingSide) {
            serveIndex = (serveIndex + 1) % 4;
          }
        }

        const servingPlayerId = String(order[serveIndex] ?? order[0] ?? '');
        update.serveIndex = serveIndex;
        update.servingPlayerId = servingPlayerId;
        if (!(match as { startedAt?: unknown }).startedAt) update.startedAt = now;

        // Auto-complete on reaching pointsToWin (simple rule as requested).
        if (nextA >= pointsToWin || nextB >= pointsToWin) {
          const winnerId = nextA === nextB ? '' : nextA > nextB ? teamAId : teamBId;
          if (winnerId) {
            update.status = 'completed';
            update.completedAt = now;
            update.winnerId = winnerId;
            update.setsWonA = winnerId === teamAId ? 1 : 0;
            update.setsWonB = winnerId === teamBId ? 1 : 0;
            const startedAt = String((match as { startedAt?: unknown }).startedAt ?? now);
            const durSec = Math.max(0, Math.floor((Date.parse(now) - Date.parse(startedAt)) / 1000));
            update.durationSeconds = durSec;
          }
        }

        const event = {
          ts: now,
          userId: actingUserId,
          refereeTeamId: String((match as { refereeTeamId?: unknown }).refereeTeamId ?? '') || undefined,
          side,
          delta: delta as 1 | -1,
          pointsA: nextA,
          pointsB: nextB,
        };
        // Validate event shape before writing.
        if (!event.userId || (event.side !== 'A' && event.side !== 'B') || (event.delta !== 1 && event.delta !== -1)) {
          return corsRes.status(400).json({ error: 'Invalid score event' });
        }

        // Optimistic concurrency: only apply if doc hasn't changed since we read it.
        const prevUpdatedAt = String((match as { updatedAt?: unknown }).updatedAt ?? '');
        const filter: Record<string, unknown> = prevUpdatedAt
          ? { _id: matchOid, updatedAt: prevUpdatedAt }
          : { _id: matchOid, $or: [{ updatedAt: { $exists: false } }, { updatedAt: '' }, { updatedAt: null }] };

        const result = await db.collection('matches').findOneAndUpdate(
          filter,
          {
            $set: update,
            $push: {
              scoreEvents: {
                $each: [event] as any[],
                $slice: -200,
              },
            },
          } as any,
          { returnDocument: 'after' }
        );
        if (!result) {
          console.log('[tournaments.action] refereePoint concurrent_or_missing', { tournamentId: id, actingUserId, matchId });
          return corsRes.status(409).json({ error: 'Concurrent score update, retry' });
        }
        // Notification: match ended if auto-completed.
        if (update.status === 'completed') {
          const tdoc = await db.collection('tournaments').findOne({ _id: oid }, { projection: { name: 1 } });
          const ta = await db.collection('teams').findOne({ _id: new ObjectId(teamAId) }, { projection: { name: 1, playerIds: 1 } });
          const tb = await db.collection('teams').findOne({ _id: new ObjectId(teamBId) }, { projection: { name: 1, playerIds: 1 } });
          const aPlayers: string[] = Array.isArray((ta as any)?.playerIds) ? (ta as any).playerIds.map(String).filter(Boolean) : [];
          const bPlayers: string[] = Array.isArray((tb as any)?.playerIds) ? (tb as any).playerIds.map(String).filter(Boolean) : [];
          const aName = String((ta as any)?.name ?? 'Team A');
          const bName = String((tb as any)?.name ?? 'Team B');
          const winnerId = String((result as any).winnerId ?? '');
          const aResult = winnerId === teamAId ? 'W' : winnerId === teamBId ? 'L' : '';
          const bResult = winnerId === teamBId ? 'W' : winnerId === teamAId ? 'L' : '';
          await notifyMany(db, aPlayers, {
            type: 'match.ended',
            params: { opponent: bName, result: aResult || '-' },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.ended:${matchId}`,
          });
          await notifyMany(db, bPlayers, {
            type: 'match.ended',
            params: { opponent: aName, result: bResult || '-' },
            data: { tournamentId: id, matchId },
            dedupeKey: `match.ended:${matchId}:b`,
          });
          void tdoc;
        }
        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'setServeOrder') {
        const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
        if (!matchId || !ObjectId.isValid(matchId)) return corsRes.status(400).json({ error: 'Invalid matchId' });
        const matchOid = new ObjectId(matchId);
        const match = await db.collection('matches').findOne({ _id: matchOid });
        if (!match) return corsRes.status(404).json({ error: 'Match not found' });
        if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== id) {
          return corsRes.status(400).json({ error: 'Match does not belong to this tournament' });
        }
        const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
        const refereeUserId = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
        const nowMs = Date.now();
        const currentLockExp = String((match as any).refereeLockExpiresAt ?? '');
        if (!actorIsAdmin && !isOrg && (!refereeUserId || refereeUserId !== actingUserId)) {
          return corsRes.status(409).json({
            error: 'Referee changed',
            refereeUserId: refereeUserId || null,
            refereeLockExpiresAt: currentLockExp || null,
          });
        }
        if (matchStatus !== 'in_progress') {
          return corsRes.status(400).json({ error: 'Match is not in progress' });
        }

        const order = Array.isArray(body?.order) ? (body.order as unknown[]).map(String).filter(Boolean) : [];
        const servingPlayerId = typeof body?.servingPlayerId === 'string' ? body.servingPlayerId.trim() : '';
        if (order.length !== 4) return corsRes.status(400).json({ error: 'Invalid serve order' });

        const now = new Date().toISOString();
        const update: Record<string, unknown> = { updatedAt: now };
        update.serveOrder = order;
        if (servingPlayerId) {
          update.servingPlayerId = servingPlayerId;
          const idx = order.findIndex((p) => p === servingPlayerId);
          if (idx >= 0) update.serveIndex = idx;
        }
        update.refereeLockExpiresAt = lockExpiresAtIso(nowMs);
        if (actorIsAdmin || isOrg) {
          update.refereeUserId = actingUserId;
        }
        const result = await db
          .collection('matches')
          .findOneAndUpdate({ _id: matchOid }, { $set: update }, { returnDocument: 'after' });
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });
        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
      }

      if (action === 'auditTournament') {
        // Admin/organizer only (uses outer gate).
        const fix = body?.fix === true;
        const matchesCol = db.collection('matches');
        const teamsCol = db.collection('teams');
        const matches = await matchesCol
          .find({ tournamentId: id })
          .project({ _id: 1, stage: 1, status: 1, division: 1, groupIndex: 1, category: 1, teamAId: 1, teamBId: 1, serveOrder: 1, orderIndex: 1, scheduledAt: 1, createdAt: 1 })
          .toArray();
        const teams = await teamsCol.find({ tournamentId: id }).project({ _id: 1, playerIds: 1 }).toArray();
        const teamPlayers = new Map<string, string[]>();
        for (const t of teams as any[]) {
          teamPlayers.set(String(t._id), Array.isArray(t.playerIds) ? t.playerIds.map(String).filter(Boolean) : []);
        }

        const issues: { matchId: string; issue: string }[] = [];
        const fixes: { matchId: string; set: Record<string, unknown> }[] = [];

        for (const m of matches as any[]) {
          const mid = String(m._id);
          const stage = String(m.stage ?? '');
          const division = String(m.division ?? '');
          const status = String(m.status ?? '');
          if (stage !== 'classification' && stage !== 'category') issues.push({ matchId: mid, issue: 'invalid_stage' });
          if (!division) issues.push({ matchId: mid, issue: 'missing_division' });
          if (stage === 'classification' && !(typeof m.groupIndex === 'number' && Number.isFinite(m.groupIndex))) {
            issues.push({ matchId: mid, issue: 'missing_groupIndex' });
          }
          if (stage === 'category' && !String(m.category ?? '')) issues.push({ matchId: mid, issue: 'missing_category' });

          const order = Array.isArray(m.serveOrder) ? m.serveOrder.map(String).filter(Boolean) : [];
          if (order.length && order.length !== 4) issues.push({ matchId: mid, issue: 'serveOrder_invalid_length' });
          if (order.length === 4) {
            const aPlayers = teamPlayers.get(String(m.teamAId)) ?? [];
            const bPlayers = teamPlayers.get(String(m.teamBId)) ?? [];
            const allowed = new Set([...aPlayers, ...bPlayers]);
            if (order.some((pid: string) => !allowed.has(pid))) issues.push({ matchId: mid, issue: 'serveOrder_invalid_player' });
          }

          if (status === 'scheduled' && (m.orderIndex == null || typeof m.orderIndex !== 'number')) {
            issues.push({ matchId: mid, issue: 'missing_orderIndex' });
          }
        }

        if (fix) {
          // Best-effort: fill missing orderIndex/scheduledAt per slice ordered by createdAt.
          const bySlice = new Map<string, any[]>();
          for (const m of matches as any[]) {
            const stage = String(m.stage ?? '');
            const div = String(m.division ?? '');
            const gi = typeof m.groupIndex === 'number' ? String(m.groupIndex) : '';
            const cat = String(m.category ?? '');
            const key = `${stage}|${div}|${stage === 'classification' ? gi : cat}`;
            const list = bySlice.get(key) ?? [];
            list.push(m);
            bySlice.set(key, list);
          }
          for (const [, list] of bySlice.entries()) {
            const sorted = list.sort((a, b) => Date.parse(String(a.createdAt ?? '')) - Date.parse(String(b.createdAt ?? '')));
            const baseNow = new Date().toISOString();
            const baseMs = Date.parse(baseNow);
            for (let i = 0; i < sorted.length; i++) {
              const m = sorted[i]!;
              const set: Record<string, unknown> = {};
              if (m.orderIndex == null || typeof m.orderIndex !== 'number') set.orderIndex = i;
              if (!m.scheduledAt && Number.isFinite(baseMs)) set.scheduledAt = new Date(baseMs + i * 60_000).toISOString();
              if (Object.keys(set).length) fixes.push({ matchId: String(m._id), set });
            }
          }
          for (const f of fixes) {
            await matchesCol.updateOne({ _id: new ObjectId(f.matchId) }, { $set: { ...f.set, updatedAt: new Date().toISOString() } });
          }
        }

        return corsRes.status(200).json({ ok: true, issues, fixed: fix ? fixes.length : 0 });
      }

      return corsRes.status(400).json({ error: 'Invalid action' });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const current = await col.findOne({ _id: oid });
      if (!current) return corsRes.status(404).json({ error: 'Tournament not found' });
      const cur = current as Record<string, unknown>;
      const actorUser = await loadActorUserWithAdminRefresh(db, actingUserId);
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(cur as { organizerIds?: string[] }, actingUserId);
      if (!isOrg && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can update this tournament' });
      }

      const allowed = [
        'name',
        'startDate',
        'endDate',
        'location',
        'description',
        'divisions',
        'categories',
        'maxTeams',
        'pointsToWin',
        'setsPerMatch',
        'groupCount',
        'classificationMatchesPerOpponent',
        'categoryFractions',
        'singleCategoryAdvanceFraction',
        'categoryPhaseFormat',
        'status',
        'organizerIds',
        'visibility',
      ];
      const update: Record<string, unknown> = {};
      const curStatus = (cur as { status?: string }).status;
      for (const k of allowed) {
        if (body[k] === undefined) continue;
        if (k === 'visibility') {
          const v = body[k];
          const s = typeof v === 'string' ? v.trim() : '';
          if (s === 'private' || s === 'public') {
            update.visibility = s;
          }
          continue;
        }
        if (k === 'status') {
          const s = body[k];
          const st = typeof s === 'string' ? s.trim() : s;
          if (st === 'cancelled') {
            update.status = 'cancelled';
          } else if (st === 'open' && curStatus === 'cancelled') {
            update.status = 'open';
          }
          // Ignore client-sent `open` / `full` — those are derived from signups.
          continue;
        }
        update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      const started =
        !!(cur as { startedAt?: unknown }).startedAt ||
        (cur as { phase?: unknown }).phase === 'classification' ||
        (cur as { phase?: unknown }).phase === 'categories' ||
        (cur as { phase?: unknown }).phase === 'completed';

      if (
        started &&
        (update.classificationMatchesPerOpponent !== undefined ||
          update.categoryFractions !== undefined ||
          update.singleCategoryAdvanceFraction !== undefined ||
          update.divisions !== undefined ||
          update.categories !== undefined ||
          update.maxTeams !== undefined ||
          update.groupCount !== undefined)
      ) {
        return corsRes.status(400).json({ error: 'Tournament already started' });
      }

      if (update.maxTeams !== undefined || update.groupCount !== undefined) {
        const curDoc = cur as { maxTeams?: number; groupCount?: number };
        const nextMax =
          update.maxTeams !== undefined ? Number(update.maxTeams) : Number(curDoc.maxTeams ?? 16);
        const nextGcRaw = update.groupCount !== undefined ? update.groupCount : curDoc.groupCount;
        const nextGc = normalizeGroupCount(nextGcRaw);
        const vg = validateTournamentGroups(nextMax, nextGc);
        if (!vg.ok) {
          const err =
            vg.reason === 'divisible'
              ? 'Max teams must be divisible by the number of groups'
              : vg.reason === 'minPerGroup'
                ? 'Each group must allow at least 2 teams (increase max teams or reduce groups)'
                : 'Invalid max teams';
          return corsRes.status(400).json({ error: err });
        }
        update.groupCount = vg.groupCount;
        update.maxTeams = nextMax;
        const teamsCol = db.collection('teams');
        const teamsList = await teamsCol.find({ tournamentId: id }).toArray();
        const perGroup = new Map<number, number>();
        for (const tm of teamsList) {
          const gi = teamGroupIndex(tm as { groupIndex?: number });
          if (gi >= vg.groupCount) {
            return corsRes.status(400).json({
              error:
                'Some teams use a group that would not exist. Move teams in the roster before reducing groups.',
            });
          }
          perGroup.set(gi, (perGroup.get(gi) ?? 0) + 1);
        }
        for (let i = 0; i < vg.groupCount; i++) {
          if ((perGroup.get(i) ?? 0) > vg.teamsPerGroup) {
            return corsRes.status(400).json({
              error: 'Too many teams in a group for these settings. Move or remove teams first.',
            });
          }
        }
      }
      if (update.pointsToWin !== undefined) {
        const p = Number(update.pointsToWin);
        if (!Number.isFinite(p) || p < 1 || p > 99) {
          return corsRes.status(400).json({ error: 'Points to win must be between 1 and 99' });
        }
        update.pointsToWin = Math.floor(p);
      }
      if (update.setsPerMatch !== undefined) {
        const s = Number(update.setsPerMatch);
        if (!Number.isFinite(s) || s < 1 || s > 7) {
          return corsRes.status(400).json({ error: 'Sets per match must be between 1 and 7' });
        }
        update.setsPerMatch = Math.floor(s);
      }

      if (update.classificationMatchesPerOpponent !== undefined) {
        const m = Number(update.classificationMatchesPerOpponent);
        if (!Number.isFinite(m) || m < 1 || m > 5) {
          return corsRes.status(400).json({ error: 'Matches per opponent must be between 1 and 5' });
        }
        update.classificationMatchesPerOpponent = Math.floor(m);
      }

      if (update.singleCategoryAdvanceFraction !== undefined) {
        const f = Number(update.singleCategoryAdvanceFraction);
        if (!Number.isFinite(f) || f <= 0 || f >= 1) {
          return corsRes.status(400).json({ error: 'Advance fraction must be between 0 and 1' });
        }
        update.singleCategoryAdvanceFraction = Math.round(f * 1000) / 1000;
      }

      if (update.categoryPhaseFormat !== undefined) {
        const v = String(update.categoryPhaseFormat ?? '').trim();
        if (v !== 'round_robin' && v !== 'single_elim') {
          return corsRes.status(400).json({ error: 'Invalid category phase format' });
        }
        update.categoryPhaseFormat = v;
      }

      if (update.categoryFractions !== undefined) {
        const raw = update.categoryFractions;
        if (raw == null) {
          update.categoryFractions = null;
        } else if (typeof raw !== 'object' || Array.isArray(raw)) {
          return corsRes.status(400).json({ error: 'Category fractions must be an object' });
        } else {
          const allowedKeys = ['Gold', 'Silver', 'Bronze'] as const;
          const cleaned: Partial<Record<(typeof allowedKeys)[number], number>> = {};
          for (const k of allowedKeys) {
            const v = (raw as Record<string, unknown>)[k];
            if (v === undefined) continue;
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) {
              return corsRes.status(400).json({ error: 'Invalid category fractions' });
            }
            cleaned[k] = n;
          }
          const sum = allowedKeys.reduce((acc, k) => acc + (cleaned[k] ?? 0), 0);
          if (sum <= 0) {
            update.categoryFractions = null;
          } else {
            const normalized: Partial<Record<(typeof allowedKeys)[number], number>> = {};
            for (const k of allowedKeys) {
              const v = cleaned[k] ?? 0;
              if (v <= 0) continue;
              normalized[k] = Math.round((v / sum) * 1000) / 1000;
            }
            update.categoryFractions = normalized;
          }
        }
      }

      if (update.divisions !== undefined) {
        const raw = update.divisions;
        if (!Array.isArray(raw)) {
          return corsRes.status(400).json({ error: 'Divisions must be an array' });
        }
        const next = raw
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .filter((x, i, arr) => arr.indexOf(x) === i);
        const valid = next.filter((x) => x === 'men' || x === 'women' || x === 'mixed');
        if (valid.length === 0) {
          return corsRes.status(400).json({ error: 'At least one division is required' });
        }
        update.divisions = valid;
      }

      if (update.categories !== undefined) {
        const raw = update.categories;
        if (!Array.isArray(raw)) {
          return corsRes.status(400).json({ error: 'Categories must be an array' });
        }
        const next = raw
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean)
          .filter((x, i, arr) => arr.indexOf(x) === i);
        const valid = next.filter((x) => x === 'Gold' || x === 'Silver' || x === 'Bronze');
        // Empty array means "single unnamed category" preset.
        if (valid.length !== next.length) {
          return corsRes.status(400).json({ error: 'Invalid category value' });
        }
        update.categories = valid;
      }

      const prevOrganizers = (cur.organizerIds as string[]) ?? [];
      const prevOnlyRaw = Array.isArray((cur as { organizerOnlyIds?: unknown }).organizerOnlyIds)
        ? ((cur as { organizerOnlyIds: string[] }).organizerOnlyIds)
        : [];
      const prevCoversRaw = (cur as { organizerOnlyCovers?: unknown }).organizerOnlyCovers;

      const coverageRelevant =
        update.organizerIds !== undefined ||
        body.organizerOnlyIds !== undefined ||
        body.organizerOnlyCovers !== undefined ||
        update.divisions !== undefined;

      let nextOnlyForRemoval: string[] = [];

      if (coverageRelevant) {
        const mergedDivisions =
          update.divisions !== undefined ? (update.divisions as unknown) : (cur as { divisions?: unknown }).divisions;
        const nextOrgs = (update.organizerIds !== undefined
          ? update.organizerIds
          : cur.organizerIds) as string[];
        if (!Array.isArray(nextOrgs) || nextOrgs.length === 0) {
          return corsRes.status(400).json({ error: 'At least one organizer is required' });
        }

        let nextOnly: string[];
        if (body.organizerOnlyIds !== undefined) {
          if (!Array.isArray(body.organizerOnlyIds)) {
            return corsRes.status(400).json({ error: 'organizerOnlyIds must be an array' });
          }
          nextOnly = body.organizerOnlyIds.filter((x: unknown) => typeof x === 'string' && ObjectId.isValid(x));
          if (!nextOnly.every((uid) => nextOrgs.includes(uid))) {
            return corsRes.status(400).json({ error: 'organizerOnlyIds must be a subset of organizerIds' });
          }
        } else {
          nextOnly = prevOnlyRaw.filter((oid) => nextOrgs.includes(oid));
        }

        const divs = tournamentDivisionsNormalized(mergedDivisions);
        const divSet = new Set(divs);

        let nextCovers: Record<string, TournamentDivision[]>;
        if (body.organizerOnlyCovers !== undefined) {
          if (
            body.organizerOnlyCovers !== null &&
            (typeof body.organizerOnlyCovers !== 'object' || Array.isArray(body.organizerOnlyCovers))
          ) {
            return corsRes.status(400).json({ error: 'organizerOnlyCovers must be an object' });
          }
          const raw = (body.organizerOnlyCovers ?? {}) as Record<string, unknown>;
          nextCovers = {};
          for (const uid of nextOnly) {
            const arr = raw[uid];
            const list = Array.isArray(arr) ? arr : [];
            nextCovers[uid] = [
              ...new Set(
                list
                  .filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed')
                  .filter((x) => divSet.has(x))
              ),
            ];
          }
        } else {
          const prevObj =
            prevCoversRaw && typeof prevCoversRaw === 'object' && !Array.isArray(prevCoversRaw)
              ? (prevCoversRaw as Record<string, unknown>)
              : {};
          nextCovers = {};
          for (const uid of nextOnly) {
            const arr = prevObj[uid];
            const list = Array.isArray(arr) ? arr : [];
            nextCovers[uid] = [
              ...new Set(
                list
                  .filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed')
                  .filter((x) => divSet.has(x))
              ),
            ];
          }
        }

        for (const uid of nextOnly) {
          if (!nextCovers[uid]?.length) {
            return corsRes.status(400).json({
              error: 'Organize-only organizers must cover at least one division',
            });
          }
        }

        const entriesCol = db.collection('entries');
        const entryUserIds = new Set(
          (await entriesCol.find({ tournamentId: id }).toArray()).map((e) => e.userId as string)
        );

        if (update.organizerIds !== undefined) {
          if (!actorIsAdmin) {
            for (const uid of nextOrgs) {
              if (prevOrganizers.includes(uid)) continue;
              if (!entryUserIds.has(uid)) {
                return corsRes.status(400).json({
                  error: 'New organizers must be players who joined this tournament',
                });
              }
            }
          } else {
            for (const uid of nextOrgs) {
              if (!ObjectId.isValid(uid)) {
                return corsRes.status(400).json({ error: 'Invalid organizer user id' });
              }
            }
            for (const uid of nextOrgs) {
              if (prevOrganizers.includes(uid)) continue;
              if (!entryUserIds.has(uid)) {
                if (!nextOnly.includes(uid)) {
                  return corsRes.status(400).json({
                    error: 'Organizers who are not registered must be marked organize-only',
                  });
                }
                if (!nextCovers[uid]?.length) {
                  return corsRes.status(400).json({
                    error: 'Organize-only organizers must cover at least one division',
                  });
                }
              }
            }
          }
        }

        const cov = await assertOrganizersCoverAllDivisions(db, id, {
          divisions: mergedDivisions,
          organizerIds: nextOrgs,
          organizerOnlyIds: nextOnly,
          organizerOnlyCovers: nextCovers,
        });
        if (!cov.ok) {
          return corsRes.status(400).json({ error: cov.error });
        }

        update.organizerOnlyIds = nextOnly;
        update.organizerOnlyCovers = nextCovers;
        nextOnlyForRemoval = nextOnly;
      }

      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Tournament not found' });
      for (const uid of nextOnlyForRemoval) {
        await removePlayerFromTournament(db, id, uid);
      }
      const afterStatus = (result as { status?: string }).status;
      if (afterStatus !== 'cancelled') {
        await syncTournamentOpenFullStatus(db, id);
      }
      const fresh = await col.findOne({ _id: oid });
      return corsRes.status(200).json(serializeDoc((fresh ?? result) as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });
      const actorUser = await loadActorUserWithAdminRefresh(db, actingUserId);
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!isTournamentOrganizer(doc as { organizerIds?: string[] }, actingUserId) && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can delete this tournament' });
      }
      const entriesCol = db.collection('entries');
      const entryCount = await entriesCol.countDocuments({ tournamentId: id });
      if (entryCount > 0) {
        return corsRes.status(400).json({
          error:
            'Cannot delete tournament while players are registered. Remove all players from the roster first.',
        });
      }
      await entriesCol.deleteMany({ tournamentId: id });
      await db.collection('teams').deleteMany({ tournamentId: id });
      await col.deleteOne({ _id: oid });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
