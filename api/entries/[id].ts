import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { entryPatchSchema } from '../../server/lib/schemas/entryPatch';
import { isTournamentOrganizer } from '../../server/lib/organizer';
import { removePlayerFromTournament } from '../../server/lib/tournamentPlayerRemoval';
import { replaceLeavingUserWithGuest } from '../../server/lib/tournamentStartedPlayerReplacement';
import { isUserAdmin, resolveActorUserId } from '../../server/lib/auth';
import { syncTournamentOpenFullStatus } from '../../server/lib/tournamentStatusSync';
import {
  assertOrganizersCoverAllDivisions,
  mergedCoverageAfterRemovingOrganizer,
} from '../../server/lib/tournamentOrganizerDivisionCoverage';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
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
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = entryPatchSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const body = parsed.data as Record<string, unknown>;
      const actingUserId = resolveActorUserId(req, body);
      if (!actingUserId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      if (!ObjectId.isValid(actingUserId)) {
        return corsRes.status(400).json({ error: 'Invalid acting user' });
      }
      const entry = await col.findOne({ _id: oid });
      if (!entry) return corsRes.status(404).json({ error: 'Entry not found' });
      const tournamentId = String((entry as { tournamentId?: unknown }).tournamentId ?? '');
      const entryUserId = String((entry as { userId?: unknown }).userId ?? '');
      const entryGuestId = String((entry as { guestPlayerId?: unknown }).guestPlayerId ?? '').trim();

      const tournament = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) return corsRes.status(404).json({ error: 'Tournament not found' });
      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));
      const actorIsOrganizer = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId);
      const self = !entryGuestId && actingUserId === entryUserId;
      if (!self && !actorIsAdmin && !actorIsOrganizer) {
        return corsRes.status(403).json({ error: 'Not allowed' });
      }

      const allowed = ['teamId', 'lookingForPartner', 'status'];
      const update: Record<string, unknown> = {};
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }

      // Validate teamId updates (string-only) and keep status consistent.
      if (update.teamId !== undefined) {
        const nextTeamId = typeof update.teamId === 'string' ? update.teamId.trim() : '';
        const currentTeamIdRaw = (entry as { teamId?: unknown }).teamId;
        const hadTeam =
          currentTeamIdRaw != null &&
          String(currentTeamIdRaw).trim() !== '' &&
          String(currentTeamIdRaw) !== 'null';

        // Clearing teamId must dissolve the team (both players → waitlist), never orphan one entry.
        if (!nextTeamId) {
          if (hadTeam) {
            if (entryGuestId) {
              return corsRes.status(400).json({
                error: 'Guest roster rows cannot be cleared this way; update the team as an organizer',
              });
            }
            await removePlayerFromTournament(db, tournamentId, entryUserId, { leaveTournament: false });
            await syncTournamentOpenFullStatus(db, tournamentId);
            return corsRes.status(200).json({
              ok: true,
              dissolved: true,
              tournamentId,
              userId: entryUserId,
            });
          }
          update.teamId = null;
          update.status = 'joined';
          update.lookingForPartner = true;
        } else {
          if (!ObjectId.isValid(nextTeamId)) {
            return corsRes.status(400).json({ error: 'Invalid teamId' });
          }
          const team = await db.collection('teams').findOne({ _id: new ObjectId(nextTeamId) });
          if (!team) return corsRes.status(400).json({ error: 'Team not found' });
          if (String((team as { tournamentId?: unknown }).tournamentId ?? '') !== tournamentId) {
            return corsRes.status(400).json({ error: 'Team does not belong to this tournament' });
          }
          if (!actorIsAdmin && !actorIsOrganizer && !self) {
            return corsRes.status(403).json({ error: 'Not allowed' });
          }
          update.teamId = nextTeamId;
          update.status = 'in_team';
          update.lookingForPartner = false;
        }
      }
      if (update.status !== undefined) {
        const s = typeof update.status === 'string' ? update.status.trim() : '';
        if (s !== 'joined' && s !== 'in_team') {
          return corsRes.status(400).json({ error: 'Invalid status' });
        }
        update.status = s;
      }
      if (update.lookingForPartner !== undefined) {
        update.lookingForPartner = !!update.lookingForPartner;
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
      const started =
        !!(tournament as { startedAt?: unknown }).startedAt ||
        (tournament as { phase?: unknown }).phase === 'classification' ||
        (tournament as { phase?: unknown }).phase === 'categories' ||
        (tournament as { phase?: unknown }).phase === 'completed';

      const actorUser = await db.collection('users').findOne({ _id: new ObjectId(actingUserId) });
      const actorIsAdmin = !!(actorUser && isUserAdmin(actorUser as { role?: string; email?: string }));

      const selfRemove = entryUserId === actingUserId;
      const organizerKick = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actingUserId);
      if (!selfRemove && !organizerKick && !actorIsAdmin) {
        return corsRes.status(403).json({ error: 'Not allowed to remove this entry' });
      }

      // Tournament started: do not allow deleting players. If the player leaves, replace them with a guest clone.
      if (started) {
        if (!selfRemove) {
          return corsRes.status(400).json({ error: 'Tournament already started' });
        }
        const orgsStarted = ((tournament as { organizerIds?: string[] }).organizerIds ?? []) as string[];
        if (orgsStarted.includes(entryUserId)) {
          return corsRes.status(400).json({ error: 'Promote another organizer before you leave the tournament' });
        }
        const repl = await replaceLeavingUserWithGuest(db, tournamentId, entryUserId);
        if (!repl.ok) return corsRes.status(500).json({ error: repl.error });
        return corsRes.status(200).json({ ok: true, replacedWithGuest: true, guestId: repl.guestId });
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
          const mergedSelf = mergedCoverageAfterRemovingOrganizer(
            tournament as { divisions?: unknown; organizerOnlyIds?: unknown; organizerOnlyCovers?: unknown },
            next,
            entryUserId
          );
          const covSelf = await assertOrganizersCoverAllDivisions(db, tournamentId, mergedSelf);
          if (!covSelf.ok) {
            return corsRes.status(400).json({ error: covSelf.error });
          }
          await tournamentsCol.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
              $pull: { organizerIds: entryUserId },
              $set: {
                organizerOnlyIds: mergedSelf.organizerOnlyIds,
                organizerOnlyCovers: mergedSelf.organizerOnlyCovers,
                updatedAt: new Date().toISOString(),
              },
            } as never
          );
        }

        // Safety: do not allow leaving if you'd orphan the tournament with only guest players.
        // This can happen if organizerIds is empty/out-of-sync; regardless, a tournament needs at least
        // one registered (non-guest) user to manage it (or the user should delete the tournament instead).
        const otherRegisteredCount = await col.countDocuments({
          tournamentId,
          userId: { $ne: actingUserId },
          $or: [{ guestPlayerId: { $exists: false } }, { guestPlayerId: null }, { guestPlayerId: '' }],
        });
        if (otherRegisteredCount === 0) {
          return corsRes.status(400).json({
            error: 'Cannot leave the tournament as the last registered user',
          });
        }
      } else {
        const orgsKick = ((tournament as { organizerIds?: string[] }).organizerIds ?? []) as string[];
        if (orgsKick.includes(entryUserId)) {
          const nextKick = orgsKick.filter((o) => o !== entryUserId);
          if (nextKick.length === 0 && !actorIsAdmin) {
            return corsRes.status(400).json({ error: 'Cannot remove the last organizer' });
          }
          if (nextKick.length > 0) {
            const mergedKick = mergedCoverageAfterRemovingOrganizer(
              tournament as { divisions?: unknown; organizerOnlyIds?: unknown; organizerOnlyCovers?: unknown },
              nextKick,
              entryUserId
            );
            const covKick = await assertOrganizersCoverAllDivisions(db, tournamentId, mergedKick);
            if (!covKick.ok) {
              return corsRes.status(400).json({ error: covKick.error });
            }
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
          const mergedFinal = mergedCoverageAfterRemovingOrganizer(
            tournament as { divisions?: unknown; organizerOnlyIds?: unknown; organizerOnlyCovers?: unknown },
            finalOrgs,
            entryUserId
          );
          const covFinal = await assertOrganizersCoverAllDivisions(db, tournamentId, mergedFinal);
          if (!covFinal.ok) {
            return corsRes.status(400).json({ error: covFinal.error });
          }
          await tournamentsCol.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
              $set: {
                organizerIds: finalOrgs,
                organizerOnlyIds: mergedFinal.organizerOnlyIds,
                organizerOnlyCovers: mergedFinal.organizerOnlyCovers,
                updatedAt: now,
              },
            }
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
