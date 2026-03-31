import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { normalizeGroupCount, validateTournamentGroups, teamGroupIndex } from '../lib/tournamentGroups';
import {
  buildInviteOgHtml,
  injectInviteOgIntoIndexHtml,
  parseOgLang,
  siteOrigin,
} from '../server/lib/inviteOgHtml';
import { tournamentCreateSchema } from '../server/lib/schemas/tournamentCreate';
import { parseLimitOffset } from '../server/lib/pagination';

/** Broad tournament lists: hide `private` unless admin, or (with auth) the user is an organizer of that event. Skipped for `organizerId` queries (my tournaments) or `inviteLink` queries. */
function applyVisibilityListFilter(
  filter: Record<string, unknown>,
  actorId: string | null,
  actorIsAdmin: boolean,
  skip: boolean,
): void {
  if (skip || actorIsAdmin) return;

  const visClause: Record<string, unknown> = actorId
    ? {
        $or: [
          { visibility: 'public' },
          { visibility: { $exists: false } },
          { organizerIds: actorId },
        ],
      }
    : {
        $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
      };

  const existing = { ...filter };
  Object.keys(filter).forEach((k) => delete filter[k]);
  if (Object.keys(existing).length === 0) {
    Object.assign(filter, visClause);
  } else {
    filter.$and = [existing, visClause];
  }
}

async function fetchDeployedIndexHtml(origin: string): Promise<string | null> {
  for (const path of ['/index.html', '/']) {
    try {
      const r = await fetch(`${origin}${path}`, {
        headers: { Accept: 'text/html' },
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const text = await r.text();
      if (text.includes('id="root"') && text.includes('og:title')) {
        return text;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  try {
    const db = await getDb();
    const col = db.collection('tournaments');

    if (req.method === 'GET') {
      const q = req.query;
      const status = typeof q.status === 'string' ? q.status : undefined;
      const organizerId = typeof q.organizerId === 'string' ? q.organizerId : undefined;
      const inviteRaw = q.inviteLink;
      const inviteLink =
        typeof inviteRaw === 'string' ? inviteRaw : Array.isArray(inviteRaw) ? inviteRaw[0] : undefined;
      const ogWant = q.og === '1' || q.og === 'true';

      const hasStatus = !!status;
      const hasOrg = !!organizerId;
      const hasInvite = typeof inviteLink === 'string' && inviteLink.length > 0;

      // Exact invite token: one document only (avoids wrong row when sort/duplicates differ from sharer's tournament).
      if (hasInvite && !hasStatus && !hasOrg) {
        const token = inviteLink.trim();
        const doc = await col.findOne({ inviteLink: token });
        if (ogWant) {
          const lang = parseOgLang(q.lang);
          const origin = siteOrigin();
          const shell = await fetchDeployedIndexHtml(origin);
          const html = shell
            ? injectInviteOgIntoIndexHtml(shell, doc, token, lang)
            : buildInviteOgHtml(doc, token, lang);
          return corsRes
            .status(200)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')
            .send(html);
        }
        return corsRes.status(200).json(doc ? [serializeDoc(doc as Record<string, unknown>)] : []);
      }

      const filter: Record<string, unknown> = {};
      if (hasStatus) filter.status = status;
      if (hasOrg) filter.organizerIds = { $in: [organizerId] };
      if (hasInvite) filter.inviteLink = inviteLink!.trim();

      const actorId = getSessionUserId(req);
      let actorIsAdmin = false;
      if (actorId && ObjectId.isValid(actorId)) {
        const u = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
        actorIsAdmin = !!(u && isUserAdmin(u as { role?: string; email?: string }));
      }
      applyVisibilityListFilter(filter, actorId, actorIsAdmin, hasOrg || !!hasInvite);

      let listQuery = col.find(filter).sort({ startDate: 1, date: 1 });
      if (req.query.limit != null || req.query.offset != null) {
        const { limit, offset } = parseLimitOffset(req.query);
        listQuery = listQuery.skip(offset).limit(limit);
      }
      const docs = await listQuery.toArray();
      const entriesCol = db.collection('entries');
      const tournamentIds = docs.map((d) =>
        d._id instanceof ObjectId ? d._id.toString() : String(d._id),
      );
      const tournamentObjectIds = tournamentIds
        .filter((tid) => ObjectId.isValid(tid))
        .map((tid) => new ObjectId(tid));
      const tournamentIdMatch = { $in: [...tournamentIds, ...tournamentObjectIds] };
      const countByTournament = new Map<string, number>();
      if (tournamentIds.length > 0) {
        const agg = await entriesCol
          .aggregate<{ _id: string; count: number }>([
            { $match: { tournamentId: tournamentIdMatch, teamId: { $ne: null } } },
            { $group: { _id: '$tournamentId', count: { $sum: 1 } } },
          ])
          .toArray();
        for (const row of agg) {
          countByTournament.set(String(row._id), row.count);
        }
      }

      const groupCountByTid = new Map<string, number>();
      for (const d of docs) {
        const tid = d._id instanceof ObjectId ? d._id.toString() : String(d._id);
        groupCountByTid.set(tid, normalizeGroupCount((d as { groupCount?: number }).groupCount));
      }

      const teamsCountByTid = new Map<string, number>();
      const groupsSetByTid = new Map<string, Set<number>>();
      for (const tid of tournamentIds) {
        teamsCountByTid.set(tid, 0);
        groupsSetByTid.set(tid, new Set<number>());
      }

      if (tournamentIds.length > 0) {
        const teamsCol = db.collection('teams');
        const teamsList = await teamsCol
          .find({ tournamentId: tournamentIdMatch })
          .project({ tournamentId: 1, groupIndex: 1 })
          .toArray();
        for (const row of teamsList) {
          const tid = String((row as { tournamentId?: string | ObjectId }).tournamentId ?? '');
          if (!tid) continue;
          teamsCountByTid.set(tid, (teamsCountByTid.get(tid) ?? 0) + 1);
          const ngc = groupCountByTid.get(tid) ?? normalizeGroupCount(undefined);
          const gi = teamGroupIndex(row as { groupIndex?: number });
          const clamped = Math.min(ngc - 1, Math.max(0, gi));
          groupsSetByTid.get(tid)?.add(clamped);
        }
      }

      const waitlistCountByTid = new Map<string, number>();
      for (const tid of tournamentIds) {
        waitlistCountByTid.set(tid, 0);
      }
      if (tournamentIds.length > 0) {
        const waitCol = db.collection('waitlist');
        const wagg = await waitCol
          .aggregate<{ _id: string; count: number }>([
            { $match: { tournamentId: tournamentIdMatch } },
            { $group: { _id: '$tournamentId', count: { $sum: 1 } } },
          ])
          .toArray();
        for (const row of wagg) {
          waitlistCountByTid.set(String(row._id), row.count);
        }
      }

      return corsRes.status(200).json(
        docs.map((d) => {
          const serialized = serializeDoc(d as Record<string, unknown>)!;
          const tid = d._id instanceof ObjectId ? d._id.toString() : String(d._id);
          return {
            ...serialized,
            entriesCount: countByTournament.get(tid) ?? countByTournament.get(String((d as { _id?: unknown })._id)) ?? 0,
            teamsCount: teamsCountByTid.get(tid) ?? teamsCountByTid.get(String((d as { _id?: unknown })._id)) ?? 0,
            groupsWithTeamsCount: groupsSetByTid.get(tid)?.size ?? 0,
            waitlistCount: waitlistCountByTid.get(tid) ?? waitlistCountByTid.get(String((d as { _id?: unknown })._id)) ?? 0,
          };
        }),
      );
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = tournamentCreateSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const {
        name,
        date,
        startDate,
        endDate,
        location,
        description,
        divisions: rawDivisions,
        categories: validCategories,
        maxTeams: mt,
        pointsToWin: rawPointsToWin,
        setsPerMatch: rawSetsPerMatch,
        groupCount: rawGroups,
        inviteLink,
        organizerIds,
        visibility: rawVisibility,
      } = parsed.data;
      const sDate = (startDate || date)!.trim();
      const eDate = (endDate || date || sDate).trim();
      const pointsToWin = Number(rawPointsToWin ?? 21);
      const setsPerMatch = Number(rawSetsPerMatch ?? 1);
      const gc = normalizeGroupCount(rawGroups);
      const vg = validateTournamentGroups(mt, gc);
      if (!vg.ok) {
        const err =
          vg.reason === 'divisible'
            ? 'Max teams must be divisible by the number of groups'
            : vg.reason === 'minPerGroup'
              ? 'Each group must allow at least 2 teams (increase max teams or reduce groups)'
              : 'Invalid max teams';
        return corsRes.status(400).json({ error: err });
      }
      const orgIds = organizerIds;
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!admin && !orgIds.includes(actorId)) {
        return corsRes.status(403).json({ error: 'You must be listed as an organizer' });
      }
      if (eDate < sDate) {
        return corsRes.status(400).json({ error: 'End date must be on or after start date' });
      }
      if (!Number.isFinite(pointsToWin) || pointsToWin < 1 || pointsToWin > 99) {
        return corsRes.status(400).json({ error: 'Points to win must be between 1 and 99' });
      }
      if (!Number.isFinite(setsPerMatch) || setsPerMatch < 1 || setsPerMatch > 7) {
        return corsRes.status(400).json({ error: 'Sets per match must be between 1 and 7' });
      }

      const divisions = [...new Set(rawDivisions)];
      const now = new Date().toISOString();
      const visibility = rawVisibility === 'private' ? 'private' : 'public';
      const doc = {
        name,
        date: sDate,
        startDate: sDate,
        endDate: eDate,
        location,
        description: description || '',
        divisions,
        categories: validCategories,
        maxTeams: mt,
        pointsToWin: Math.floor(pointsToWin),
        setsPerMatch: Math.floor(setsPerMatch),
        groupCount: vg.groupCount,
        inviteLink,
        visibility,
        status: 'open',
        phase: 'registration',
        startedAt: null,
        classificationMatchesPerOpponent: 1,
        categoryFractions: null,
        singleCategoryAdvanceFraction: 0.5,
        organizerIds: orgIds,
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
