import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { getSessionUserId, isUserAdmin, resolveActorUserId } from '../../server/lib/auth';
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

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
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
        const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
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

      const [entriesCount, teamsList, waitlistCount] = await Promise.all([
        entriesCol.countDocuments({ tournamentId: id }),
        teamsCol.find({ tournamentId: id }).project({ groupIndex: 1 }).toArray(),
        waitCol.countDocuments({ tournamentId: id }),
      ]);

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
              standings: computeStandingsForGroup({ teams: groupTeams, matches: groupMatches as any }),
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
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(cur as { organizerIds?: string[] }, actingUserId);
      if (!isOrg && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can manage this tournament' });
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const action = typeof body?.action === 'string' ? body.action.trim() : '';

      if (action === 'randomizeGroups') {
        const result = await actionRandomizeGroups(db, id);
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
          const result = await actionPublishCategoryMatches(db, id);
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
          const result = await actionFinalizeClassification(db, id);
          return corsRes.status(200).json(result);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not finalize classification';
          return corsRes.status(400).json({ error: msg });
        }
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
        const setsWonA = Number(body?.setsWonA);
        const setsWonB = Number(body?.setsWonB);
        const pointsA = body?.pointsA != null ? Number(body.pointsA) : undefined;
        const pointsB = body?.pointsB != null ? Number(body.pointsB) : undefined;
        if (!Number.isFinite(setsWonA) || !Number.isFinite(setsWonB) || setsWonA < 0 || setsWonB < 0) {
          return corsRes.status(400).json({ error: 'Invalid setsWonA/setsWonB' });
        }
        if (!Number.isFinite(pointsA) || !Number.isFinite(pointsB) || (pointsA as number) < 0 || (pointsB as number) < 0) {
          return corsRes.status(400).json({ error: 'Points are required to complete a match' });
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

          if (!ObjectId.isValid(teamAId) || !ObjectId.isValid(teamBId)) {
            return corsRes.status(400).json({ error: 'Invalid team id(s) in match' });
          }
          const teams = await db
            .collection('teams')
            .find({ tournamentId: id, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
            .project({ _id: 1, division: 1, category: 1 })
            .toArray();
          const map = new Map<string, { division?: unknown; category?: unknown }>();
          for (const t of teams as unknown as Array<{ _id: ObjectId; division?: unknown; category?: unknown }>) {
            map.set(t._id.toString(), { division: t.division, category: t.category });
          }
          const ta = map.get(teamAId);
          const tb = map.get(teamBId);
          if (!ta || !tb) {
            return corsRes.status(400).json({ error: 'Category match teams not found' });
          }
          if (String(ta.division ?? '') !== division || String(tb.division ?? '') !== division) {
            return corsRes.status(400).json({ error: 'Category match division mismatch' });
          }
          if (String(ta.category ?? '') !== category || String(tb.category ?? '') !== category) {
            return corsRes.status(400).json({ error: 'Category match category mismatch' });
          }
        }

        const winnerId = setsWonA === setsWonB ? '' : setsWonA > setsWonB ? teamAId : teamBId;
        if (!winnerId) return corsRes.status(400).json({ error: 'Matches cannot end in a tie' });

        const now = new Date().toISOString();
        const update: Record<string, unknown> = {
          setsWonA: Math.floor(setsWonA),
          setsWonB: Math.floor(setsWonB),
          winnerId,
          status: 'completed',
          completedAt: now,
          updatedAt: now,
          pointsA: Math.floor(pointsA!),
          pointsB: Math.floor(pointsB!),
        };
        const result = await db
          .collection('matches')
          .findOneAndUpdate({ _id: matchOid }, { $set: update }, { returnDocument: 'after' });
        if (!result) return corsRes.status(404).json({ error: 'Match not found' });
        return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
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
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
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
      if (update.organizerIds !== undefined) {
        const nextOrganizers = update.organizerIds as string[];
        if (!Array.isArray(nextOrganizers) || nextOrganizers.length === 0) {
          return corsRes.status(400).json({ error: 'At least one organizer is required' });
        }
        if (!actorIsAdmin) {
          const entriesCol = db.collection('entries');
          const entryUserIds = new Set((await entriesCol.find({ tournamentId: id }).toArray()).map((e) => e.userId as string));
          for (const uid of nextOrganizers) {
            if (prevOrganizers.includes(uid)) continue;
            if (!entryUserIds.has(uid)) {
              return corsRes.status(400).json({
                error: 'New organizers must be players who joined this tournament',
              });
            }
          }
        } else {
          for (const uid of nextOrganizers) {
            if (!ObjectId.isValid(uid)) {
              return corsRes.status(400).json({ error: 'Invalid organizer user id' });
            }
          }
        }
      }

      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Tournament not found' });
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
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
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
