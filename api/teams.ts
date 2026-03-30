import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { isTournamentOrganizer } from '../server/lib/organizer';
import { normalizeGroupCount, validateTournamentGroups } from '../lib/tournamentGroups';
import { countTeamsInGroup, pickLeastLoadedGroup } from '../server/lib/tournamentGroupDb';

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
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  try {
    const db = await getDb();
    const col = db.collection('teams');

    if (req.method === 'GET') {
      const filter: Record<string, unknown> = {};
      const { tournamentId, createdBy } = req.query;
      if (tournamentId && typeof tournamentId === 'string') filter.tournamentId = tournamentId;
      if (createdBy && typeof createdBy === 'string') filter.createdBy = createdBy;

      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { tournamentId, name, playerIds, createdBy, groupIndex: rawGi } = body;
      if (!tournamentId || !name || !playerIds?.length || !createdBy) {
        return corsRes.status(400).json({ error: 'Missing required fields' });
      }
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament ID' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actorId) });
      const admin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const isOrg = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actorId);
      if (!isOrg && !admin) {
        return corsRes.status(403).json({ error: 'Only organizers can create teams' });
      }
      if (!admin && createdBy !== actorId) {
        return corsRes.status(403).json({ error: 'Invalid createdBy' });
      }

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

      const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
      const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
      const vg = validateTournamentGroups(maxT, gc);
      if (!vg.ok) {
        return corsRes.status(400).json({ error: 'Tournament group configuration is invalid' });
      }
      let groupIndex: number;
      if (!hasExplicitGroupIndex(rawGi)) {
        groupIndex = await pickLeastLoadedGroup(db, tournamentId, vg);
      } else {
        let parsed = typeof rawGi === 'number' ? rawGi : parseInt(String(rawGi), 10);
        if (!Number.isFinite(parsed) || parsed < 0) parsed = 0;
        groupIndex = Math.min(vg.groupCount - 1, Math.floor(parsed));
      }
      const totalTeams = await col.countDocuments({ tournamentId });
      if (totalTeams >= maxT) {
        return corsRes.status(400).json({ error: 'Tournament is full (max teams reached)' });
      }
      const inGroup = await countTeamsInGroup(db, tournamentId, groupIndex);
      if (inGroup >= vg.teamsPerGroup) {
        return corsRes.status(400).json({ error: 'This group is full' });
      }

      const playerIdSet = new Set(cleanPlayerIds);
      const existing = await col.findOne({
        tournamentId,
        playerIds: { $in: Array.from(playerIdSet) },
      });
      if (existing) {
        return corsRes.status(400).json({ error: 'You can only be in one team per tournament' });
      }

      // Organizers/admins can only form teams from players already signed up (entries exist),
      // and players cannot already be assigned to a team.
      const entriesCol = db.collection('entries');
      const [existingEntries, alreadyInTeam] = await Promise.all([
        entriesCol
          .find({ tournamentId, userId: { $in: Array.from(playerIdSet) } })
          .project({ userId: 1, teamId: 1 })
          .toArray(),
        entriesCol.countDocuments({
          tournamentId,
          userId: { $in: Array.from(playerIdSet) },
          teamId: { $ne: null },
        }),
      ]);
      if (existingEntries.length !== cleanPlayerIds.length) {
        return corsRes.status(400).json({ error: 'All players must be registered in this tournament' });
      }
      if (alreadyInTeam > 0) {
        return corsRes.status(400).json({ error: 'One or more players are already in a team' });
      }

      const now = new Date().toISOString();
      const doc = {
        tournamentId,
        name,
        playerIds: cleanPlayerIds,
        groupIndex,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });

      // Attach entries to the team.
      await entriesCol.updateMany(
        { tournamentId, userId: { $in: cleanPlayerIds } },
        {
          $set: {
            teamId: result.insertedId.toString(),
            status: 'in_team',
            lookingForPartner: false,
            updatedAt: now,
          },
        }
      );

      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
