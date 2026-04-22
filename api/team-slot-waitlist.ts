import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin, loadActorUserWithAdminRefresh } from '../server/lib/auth';
import { isTournamentOrganizer } from '../server/lib/organizer';
import { teamSlotWaitlistPostSchema } from '../server/lib/schemas/teamSlotWaitlistPost';
import { normalizeGroupCount, validateTournamentGroups } from '../lib/tournamentGroups';
import { guestPlayerIdFromSlot, isGuestPlayerSlot, normalizeTeamPlayerSlots, parsePlayerSlot } from '../lib/playerSlots';
import { assertGuestIdsBelongToTournament, resolveTwoSlotGenders } from '../server/lib/guestPlayersDb';
import { tournamentIdMongoFilter } from '../server/lib/mongoTournamentIdFilter';
import type { TournamentDivision } from '../types';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

function firstQueryString(q: string | string[] | undefined): string | undefined {
  if (q == null) return undefined;
  return typeof q === 'string' ? q : q[0];
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function tournamentStartedDoc(t: Record<string, unknown>): boolean {
  const phase = String((t as { phase?: unknown }).phase ?? '');
  return (
    !!(t as { startedAt?: unknown }).startedAt ||
    phase === 'classification' ||
    phase === 'categories' ||
    phase === 'completed'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();
  const corsRes = withCors(req, res);
  try {
    const db = await getDb();
    const col = db.collection('team_slot_waitlist');

    if (req.method === 'GET') {
      const tournamentId = firstQueryString(req.query.tournamentId as string | string[] | undefined)?.trim();
      const divisionFilter = firstQueryString(req.query.division as string | string[] | undefined)?.trim();
      if (!tournamentId || !ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournamentId' });
      }
      const tidf = tournamentIdMongoFilter(tournamentId);
      const filter: Record<string, unknown> = { ...tidf, status: 'active' };
      if (divisionFilter === 'men' || divisionFilter === 'women' || divisionFilter === 'mixed') {
        filter.division = divisionFilter;
      }
      const rows = await col.find(filter).sort({ createdAt: 1 }).toArray();
      return corsRes.status(200).json(rows.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = teamSlotWaitlistPostSchema.safeParse(raw);
      if (!parsed.success) {
        return corsRes.status(400).json({ error: 'Invalid payload' });
      }
      const { tournamentId, name, playerIds, createdBy } = parsed.data;
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournamentId' });
      }

      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      if (tournamentStartedDoc(tournament as Record<string, unknown>)) {
        return corsRes.status(400).json({ error: 'Tournament already started' });
      }

      const actorUser = await loadActorUserWithAdminRefresh(db, actorId);
      if (!actorUser) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const admin = isUserAdmin(actorUser as { role?: string; email?: string });
      const isOrg = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actorId);

      const normalizedSlots = normalizeTeamPlayerSlots(playerIds);
      if (!normalizedSlots) {
        return corsRes.status(400).json({ error: 'Teams must have exactly 2 distinct players' });
      }
      const cleanPlayerIds: [string, string] = normalizedSlots;

      const canEnqueue =
        isOrg || admin || (cleanPlayerIds.includes(actorId) && createdBy === actorId);
      if (!canEnqueue) {
        return corsRes.status(403).json({ error: 'Not allowed to enqueue this team' });
      }
      if (!admin && createdBy !== actorId) {
        return corsRes.status(403).json({ error: 'Invalid createdBy' });
      }

      if (!isOrg && !admin) {
        if (!cleanPlayerIds.includes(actorId)) {
          return corsRes.status(403).json({ error: 'You must be one of the two players' });
        }
        const guestSlotCount = cleanPlayerIds.filter((p) => isGuestPlayerSlot(p)).length;
        if (guestSlotCount > 1) {
          return corsRes.status(403).json({ error: 'Guests can only be added by an organizer' });
        }
        if (guestSlotCount === 1) {
          const userSlot = cleanPlayerIds.find((p) => !isGuestPlayerSlot(p));
          if (userSlot !== actorId) {
            return corsRes.status(403).json({ error: 'You must be the registered player pairing with a guest' });
          }
        }
      }

      const tDivs = (tournament as { divisions?: TournamentDivision[] }).divisions;
      const resolvedPair = await resolveTwoSlotGenders(db, tournamentId, tDivs, cleanPlayerIds[0]!, cleanPlayerIds[1]!);
      if (!resolvedPair.ok) {
        return corsRes.status(400).json({ error: resolvedPair.error });
      }
      const pairDivision: TournamentDivision = resolvedPair.pairDivision;
      const s0 = parsePlayerSlot(cleanPlayerIds[0]!)!;
      const s1 = parsePlayerSlot(cleanPlayerIds[1]!)!;

      const maxT = Number((tournament as { maxTeams?: number }).maxTeams);
      const gc = normalizeGroupCount((tournament as { groupCount?: number }).groupCount);
      const vg = validateTournamentGroups(maxT, gc);
      if (!vg.ok) {
        return corsRes.status(400).json({ error: 'Tournament group configuration is invalid' });
      }

      const teamsCol = db.collection('teams');
      const tidf = tournamentIdMongoFilter(tournamentId);
      const totalTeams = await teamsCol.countDocuments(tidf);
      if (totalTeams < maxT) {
        return corsRes.status(400).json({ error: 'Tournament is not full yet — create a team normally' });
      }

      const entriesCol = db.collection('entries');
      const waitlistCol = db.collection('waitlist');
      const playerIdSet = new Set(cleanPlayerIds);
      const existing = await teamsCol.findOne({
        ...tidf,
        playerIds: { $in: Array.from(playerIdSet) },
      });
      if (existing) {
        return corsRes.status(400).json({ error: 'You can only be in one team per tournament' });
      }

      const userIdsOnly = cleanPlayerIds.filter((p) => !isGuestPlayerSlot(p));
      const guestIdsOnly = cleanPlayerIds.map((p) => guestPlayerIdFromSlot(p)).filter(Boolean) as string[];
      const orClauses: Record<string, unknown>[] = [];
      if (userIdsOnly.length) orClauses.push({ userId: { $in: userIdsOnly }, teamId: { $ne: null } });
      if (guestIdsOnly.length) orClauses.push({ guestPlayerId: { $in: guestIdsOnly }, teamId: { $ne: null } });
      const inTeamCount =
        orClauses.length === 0 ? 0 : await entriesCol.countDocuments({ ...tidf, $or: orClauses });
      if (inTeamCount > 0) {
        return corsRes.status(400).json({ error: 'One or more players are already in a team' });
      }

      const relaxedWaitlist = isOrg || admin;
      if (relaxedWaitlist) {
        if (s0.kind === 'user') {
          const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s0.userId });
          if (!w) return corsRes.status(400).json({ error: 'Registered player must be on the waiting list for this division' });
        }
        if (s1.kind === 'user') {
          const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s1.userId });
          if (!w) return corsRes.status(400).json({ error: 'Registered player must be on the waiting list for this division' });
        }
      } else {
        const guestSlotsN = cleanPlayerIds.filter((p) => isGuestPlayerSlot(p)).length;
        if (guestSlotsN === 0) {
          if (s0.kind !== 'user' || s1.kind !== 'user') {
            return corsRes.status(400).json({ error: 'Invalid team composition' });
          }
          const [w1, w2] = await Promise.all([
            waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s0.userId }),
            waitlistCol.findOne({ ...tidf, division: pairDivision, userId: s1.userId }),
          ]);
          if (!w1 || !w2) {
            return corsRes.status(400).json({ error: 'Both players must be on the waiting list' });
          }
        } else {
          const uid = cleanPlayerIds.find((p) => !isGuestPlayerSlot(p));
          const gSlot = cleanPlayerIds.find((p) => isGuestPlayerSlot(p));
          if (!uid || !gSlot) {
            return corsRes.status(400).json({ error: 'Invalid team composition' });
          }
          const w = await waitlistCol.findOne({ ...tidf, division: pairDivision, userId: uid });
          if (!w) {
            return corsRes.status(400).json({ error: 'You must be on the waiting list for this division' });
          }
          const gid = guestPlayerIdFromSlot(gSlot)!;
          const chk = await assertGuestIdsBelongToTournament(db, tournamentId, [gid]);
          if (!chk.ok) return corsRes.status(400).json({ error: chk.error });
        }
      }

      const pk = pairKey(cleanPlayerIds[0]!, cleanPlayerIds[1]!);
      const dup = await col.findOne({
        ...tidf,
        status: 'active',
        pairKey: pk,
      });
      if (dup) {
        return corsRes.status(409).json({ error: 'This pair is already on the team waiting list' });
      }

      const now = new Date().toISOString();
      const ins = await col.insertOne({
        tournamentId,
        division: pairDivision,
        name: name.trim(),
        playerIds: cleanPlayerIds,
        pairKey: pk,
        createdBy,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const doc = await col.findOne({ _id: ins.insertedId });
      return corsRes.status(201).json(serializeDoc(doc as Record<string, unknown>));
    }

    if (req.method === 'DELETE') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const id = firstQueryString(req.query.id as string | string[] | undefined)?.trim();
      if (!id || !ObjectId.isValid(id)) {
        return corsRes.status(400).json({ error: 'Invalid id' });
      }
      const row = await col.findOne({ _id: new ObjectId(id) });
      if (!row) {
        return corsRes.status(404).json({ error: 'Waitlist entry not found' });
      }
      if (String((row as { status?: unknown }).status ?? '') !== 'active') {
        return corsRes.status(400).json({ error: 'Waitlist entry is not active' });
      }
      const tournamentId = String((row as { tournamentId?: unknown }).tournamentId ?? '');
      if (!ObjectId.isValid(tournamentId)) {
        return corsRes.status(400).json({ error: 'Invalid tournament on waitlist entry' });
      }
      const tournamentsCol = db.collection('tournaments');
      const tournament = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
      if (!tournament) {
        return corsRes.status(404).json({ error: 'Tournament not found' });
      }
      const actorUser = await loadActorUserWithAdminRefresh(db, actorId);
      if (!actorUser) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const admin = isUserAdmin(actorUser as { role?: string; email?: string });
      const isOrg = isTournamentOrganizer(tournament as { organizerIds?: string[] }, actorId);
      const createdBy = String((row as { createdBy?: unknown }).createdBy ?? '');
      const pids = ((row as { playerIds?: unknown }).playerIds ?? []) as string[];
      const canRemove =
        isOrg ||
        admin ||
        actorId === createdBy ||
        pids.includes(actorId);
      if (!canRemove) {
        return corsRes.status(403).json({ error: 'Not allowed to remove this waitlist entry' });
      }

      await col.deleteOne({ _id: new ObjectId(id) });
      return corsRes.status(204).end();
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
