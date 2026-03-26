import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { isUserAdmin, loadActorUserWithAdminRefresh, resolveActorUserId } from '../../server/lib/auth';
import { normalizeGroupCount, validateTournamentGroups, teamGroupIndex } from '../../lib/tournamentGroups';
import { countTeamsInGroup } from '../../server/lib/tournamentGroupDb';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

function firstQueryString(q: string | string[] | undefined): string | undefined {
  if (q == null) return undefined;
  return typeof q === 'string' ? q : q[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  const id = firstQueryString(req.query.id as string | string[] | undefined);
  if (!id || !ObjectId.isValid(id)) {
    return corsRes.status(400).json({ error: 'Invalid team ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('teams');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
      }
      const team = await col.findOne({ _id: oid });
      if (!team) return corsRes.status(404).json({ error: 'Team not found' });
      const tournamentId = team.tournamentId as string;
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament on team' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
      if (!ObjectId.isValid(actingUserId)) {
        return corsRes.status(400).json({ error: 'Invalid acting user' });
      }
      const actorUserPatch = await loadActorUserWithAdminRefresh(db, actingUserId);
      if (!actorUserPatch) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const actorIsAdminPatch = isUserAdmin(actorUserPatch as { role?: string; email?: string });
      if (!isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId) && !actorIsAdminPatch) {
        return corsRes.status(403).json({ error: 'Only organizers can update this team' });
      }

      const allowed = ['name', 'playerIds', 'groupIndex'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      if (update.groupIndex !== undefined) {
        const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
        const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
        const vg = validateTournamentGroups(maxT, gc);
        if (!vg.ok) {
          return corsRes.status(400).json({ error: 'Tournament group configuration is invalid' });
        }
        let nextGi = typeof update.groupIndex === 'number' ? update.groupIndex : parseInt(String(update.groupIndex), 10);
        if (!Number.isFinite(nextGi) || nextGi < 0) nextGi = 0;
        nextGi = Math.min(vg.groupCount - 1, Math.floor(nextGi));
        update.groupIndex = nextGi;
        const currentGi = teamGroupIndex(team as { groupIndex?: number });
        if (nextGi !== currentGi) {
          const inTarget = await countTeamsInGroup(db, tournamentId, nextGi);
          if (inTarget >= vg.teamsPerGroup) {
            return corsRes.status(400).json({ error: 'Target group is full' });
          }
        }
      }

      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
      }
      const team = await col.findOne({ _id: oid });
      if (!team) return corsRes.status(404).json({ error: 'Team not found' });
      const tournamentId = team.tournamentId as string;
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament on team' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
      if (!ObjectId.isValid(actingUserId)) {
        return corsRes.status(400).json({ error: 'Invalid acting user' });
      }
      const actorUserDel = await loadActorUserWithAdminRefresh(db, actingUserId);
      if (!actorUserDel) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const actorIsAdminDel = isUserAdmin(actorUserDel as { role?: string; email?: string });
      if (!isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId) && !actorIsAdminDel) {
        return corsRes.status(403).json({ error: 'Only organizers can remove a team' });
      }

      const teamIdStr = id;
      const now = new Date().toISOString();
      /** Match entries whether teamId was stored as string or ObjectId (legacy data). */
      await db.collection('entries').updateMany(
        { $or: [{ teamId: teamIdStr }, { teamId: oid }] },
        {
          $set: {
            teamId: null,
            status: 'joined',
            lookingForPartner: true,
            updatedAt: now,
          },
        }
      );
      const result = await col.deleteOne({ _id: oid });
      if (result.deletedCount === 0) return corsRes.status(404).json({ error: 'Team not found' });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
