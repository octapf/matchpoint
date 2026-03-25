import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { isUserAdmin, resolveActorUserId } from '../../server/lib/auth';

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
      return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
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

      const allowed = ['name', 'date', 'startDate', 'endDate', 'location', 'description', 'maxTeams', 'status', 'organizerIds'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      const prevOrganizers = (cur.organizerIds as string[]) ?? [];
      if (update.organizerIds !== undefined) {
        const nextOrganizers = update.organizerIds as string[];
        if (!Array.isArray(nextOrganizers) || nextOrganizers.length === 0) {
          return corsRes.status(400).json({ error: 'At least one organizer is required' });
        }
        if (!actorIsAdmin) {
          const entriesCol = db.collection('entries');
          const entryUserIds = new Set(
            (await entriesCol.find({ tournamentId: id }).toArray()).map((e) => e.userId as string)
          );
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
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actingUserId = resolveActorUserId(req);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Sign in required or pass actingUserId' });
      }
      const doc = await col.findOne({ _id: oid });
      if (!doc) return corsRes.status(404).json({ error: 'Tournament not found' });
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      if (!isTournamentOrganizer(doc as { organizerIds?: string[] }, actingUserId) && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Only organizers can delete this tournament' });
      }
      await db.collection('entries').deleteMany({ tournamentId: id });
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
