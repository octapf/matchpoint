import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb, getMongoClient } from '../server/lib/mongodb';
import { parseLimitOffset } from '../server/lib/pagination';
import { teamsPostSchema } from '../server/lib/schemas/teamsPost';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { isTournamentOrganizer } from '../server/lib/organizer';
import { normalizeGroupCount, tournamentAllowsManualGroupAssignment, validateTournamentGroups } from '../lib/tournamentGroups';
import { countTeamsInGroup } from '../server/lib/tournamentGroupDb';
import { isPairValidForTournamentDivisions } from '../server/lib/teamDivisionPairing';
import { syncTournamentOpenFullStatus } from '../server/lib/tournamentStatusSync';
import type { TournamentDivision } from '../types';
import { notifyMany } from '../server/lib/notify';

function hasExplicitGroupIndex(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return true;
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
    const col = db.collection('teams');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, createdBy } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (createdBy && typeof createdBy === 'string') filter.createdBy = createdBy;

      let cursor = col.find(filter).sort({ createdAt: -1 });
      const q = req.query;
      if (q.limit != null || q.offset != null) {
        const { limit, offset } = parseLimitOffset(q);
        cursor = cursor.skip(offset).limit(limit);
      }
      const docs = await cursor.toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = teamsPostSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const { tournamentId, name, playerIds, createdBy, groupIndex: rawGi } = parsed.data;
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actorId);

      const playerIdList = Array.isArray(playerIds) ? playerIds : [playerIds];
      const cleanPlayerIds = playerIdList
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter(Boolean)
        .filter((x, i, arr) => arr.indexOf(x) === i);
      if (cleanPlayerIds.length !== 2) {
        return corsRes.status(400).json({ error: 'Teams must have exactly 2 distinct players' });
      }
      for (const pid of cleanPlayerIds) {
        if (!ObjectId.isValid(pid)) {
          return corsRes.status(400).json({ error: 'Invalid player id' });
        }
      }

      const canCreateTeam =
        isOrg || admin || (cleanPlayerIds.includes(actorId) && createdBy === actorId);
      if (!canCreateTeam) {
        return corsRes.status(403).json({ error: 'Not allowed to create this team' });
      }
      if (!admin && createdBy !== actorId) {
        return corsRes.status(403).json({ error: 'Invalid createdBy' });
      }

      if (!isOrg && !admin) {
        if (!cleanPlayerIds.includes(actorId)) {
          return corsRes.status(403).json({ error: 'You must be one of the two players' });
        }
      }

      const usersCol = db.collection('users');
      const [u1, u2] = await Promise.all([
        usersCol.findOne({ _id: new ObjectId(cleanPlayerIds[0]!) }),
        usersCol.findOne({ _id: new ObjectId(cleanPlayerIds[1]!) }),
      ]);
      if (!u1 || !u2) {
        return corsRes.status(400).json({ error: 'Player not found' });
      }
      const rawG1 = (u1 as Record<string, unknown>).gender;
      const rawG2 = (u2 as Record<string, unknown>).gender;
      const g1 = typeof rawG1 === 'string' ? rawG1 : undefined;
      const g2 = typeof rawG2 === 'string' ? rawG2 : undefined;
      const tDivs = (tournament as { divisions?: TournamentDivision[] }).divisions;
      const divCheck = isPairValidForTournamentDivisions(tDivs, g1, g2);
      if (!divCheck.ok) {
        return corsRes.status(400).json({ error: divCheck.reason });
      }
      const pairDivision: TournamentDivision = divCheck.division;

      const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
      const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
      const vg = validateTournamentGroups(maxT, gc);
      if (!vg.ok) {
        return corsRes.status(400).json({ error: 'Tournament group configuration is invalid' });
      }
      const allowManualGroups = tournamentAllowsManualGroupAssignment(
        tournament as { groupsDistributedAt?: string | null }
      );
      let groupIndex: number | null;
      if (!allowManualGroups) {
        groupIndex = null;
      } else if (!hasExplicitGroupIndex(rawGi)) {
        groupIndex = null;
      } else {
        let parsed = typeof rawGi === 'number' ? rawGi : parseInt(String(rawGi), 10);
        if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;
        groupIndex = Math.min(vg.groupCount - 1, Math.floor(parsed));
        const inGroup = await countTeamsInGroup(db, tournamentId, groupIndex);
        if (inGroup >= vg.teamsPerGroup) {
          return corsRes.status(400).json({ error: 'This group is full' });
        }
      }
      const totalTeams = await col.countDocuments({ tournamentId });
      if (totalTeams >= maxT) {
        return corsRes.status(400).json({ error: 'Tournament is full (max teams reached)' });
      }

      const playerIdSet = new Set(cleanPlayerIds);
      const existing = await col.findOne({
        tournamentId,
        playerIds: { $in: Array.from(playerIdSet) },
      });
      if (existing) {
        return corsRes.status(400).json({ error: 'You can only be in one team per tournament' });
      }

      const entriesCol = db.collection('entries');
      const waitlistCol = db.collection('waitlist');
      const [w1, w2, inTeamCount] = await Promise.all([
        waitlistCol.findOne({ tournamentId, division: pairDivision, userId: cleanPlayerIds[0] }),
        waitlistCol.findOne({ tournamentId, division: pairDivision, userId: cleanPlayerIds[1] }),
        entriesCol.countDocuments({
          tournamentId,
          userId: { $in: cleanPlayerIds },
          teamId: { $ne: null },
        }),
      ]);
      if (!w1 || !w2) {
        return corsRes.status(400).json({ error: 'Both players must be on the waiting list' });
      }
      if (inTeamCount > 0) {
        return corsRes.status(400).json({ error: 'One or more players are already in a team' });
      }

      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        name,
        playerIds: cleanPlayerIds,
        groupIndex,
        division: pairDivision,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };

      const client = await getMongoClient();
      const session = client.startSession();
      let inserted: Record<string, unknown> | null = null;
      try {
        await session.withTransaction(async () => {
          const tdb = client.db('matchpoint');
          const teamsCol = tdb.collection('teams');
          const ec = tdb.collection('entries');
          const wc = tdb.collection('waitlist');
          const result = await teamsCol.insertOne(doc, { session });
          const ins = await teamsCol.findOne({ _id: result.insertedId }, { session });
          inserted = ins as Record<string, unknown> | null;
          const tidStr = result.insertedId.toString();
          for (const uid of cleanPlayerIds) {
            await ec.deleteMany({ tournamentId, userId: uid, teamId: null }, { session });
            await ec.insertOne(
              {
                tournamentId,
                userId: uid,
                teamId: tidStr,
                status: 'in_team',
                lookingForPartner: false,
                createdAt: now,
                updatedAt: now,
              },
              { session }
            );
          }
          // Remove from waitlist across ALL divisions for this tournament (prevents stale WL rows after forming a team).
          await wc.deleteMany({ tournamentId, userId: { $in: cleanPlayerIds } }, { session });
        });
      } finally {
        await session.endSession();
      }

      if (!inserted) {
        return corsRes.status(500).json({ error: 'Internal server error' });
      }
      await syncTournamentOpenFullStatus(db, tournamentId);

      // In-app notifications: team created.
      const tournamentName = String((tournament as { name?: unknown }).name ?? '');
      await notifyMany(db, cleanPlayerIds, {
        type: 'team.created',
        params: { tournament: tournamentName || 'Tournament', team: name },
        data: { tournamentId, teamId: (inserted as any)?._id ?? '' },
        dedupeKey: `team.created:${tournamentId}:${(inserted as any)?._id ?? ''}`,
      });

      return corsRes.status(201).json(serializeDoc(inserted));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
