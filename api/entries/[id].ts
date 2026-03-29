import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { removePlayerFromTournament } from '../../server/lib/tournamentPlayerRemoval';
import { isUserAdmin, resolveActorUserId } from '../../server/lib/auth';
import { syncTournamentOpenFullStatus } from '../../server/lib/tournamentStatusSync';

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
    return corsRes.status(400).json({ error: 'Invalid entry ID' });
  }

  try {
    const db = await getDb();
    const col = db.collection('entries');
    const oid = new ObjectId(id);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Entry not found' });
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const allowed = ['teamId', 'lookingForPartner', 'status'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }
      update.updatedAt = new Date().toISOString();
      const result = await col.findOneAndUpdate(
        { _id: oid },
        { $set: update },
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'Entry not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const entry = await col.findOne({ _id: oid });
      if (!entry) return corsRes.status(404).json({ error: 'Entry not found' });
      const tournamentId = entry.tournamentId as string;
      const entryUserId = entry.userId as string;

      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });

      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));

      const selfRemove = entryUserId === actingUserId;
      const organizerKick = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId);
      if (!selfRemove && !organizerKick && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Not allowed to remove this entry' });
      }

      if (selfRemove) {
        const orgs = ((tournament as { organizerIds?: string[] }).organizerIds ?? []) as string[];
        if (orgs.includes(entryUserId)) {
          const next = orgs.filter((o) => o !== entryUserId);
          if (next.length === 0) {
            return corsRes.status(400).json({
              error: 'Promote another organizer before you leave the tournament',
            });
          }
          await tournamentsCol.updateOne(
            { _id: new ObjectId(tournamentId) },
            { $pull: { organizerIds: entryUserId }, $set: { updatedAt: new Date().toISOString() } } as never
          );
        }
      } else {
        const orgsKick = ((tournament as { organizerIds?: string[] }).organizerIds ?? []) as string[];
        if (orgsKick.includes(entryUserId)) {
          const nextKick = orgsKick.filter((o) => o !== entryUserId);
          if (nextKick.length === 0 && !actorIsAdmin) {
            return corsRes.status(400).json({ error: 'Cannot remove the last organizer' });
          }
        }
      }

      await removePlayerFromTournament(db, tournamentId, entryUserId);
      await syncTournamentOpenFullStatus(db, tournamentId);

      if (!selfRemove) {
        const orgsAfter = ((tournament as { organizerIds?: string[] }).organizerIds ?? []) as string[];
        if (orgsAfter.includes(entryUserId)) {
          const next = orgsAfter.filter((o) => o !== entryUserId);
          const now = new Date().toISOString();
          let finalOrgs = next;
          if (finalOrgs.length === 0 && actorIsAdmin) {
            finalOrgs = [actingUserId];
          }
          await tournamentsCol.updateOne(
            { _id: new ObjectId(tournamentId) },
            { $set: { organizerIds: finalOrgs, updatedAt: now } }
          );
        }
      }

      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
