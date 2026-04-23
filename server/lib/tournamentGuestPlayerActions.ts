import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { guestPlayerInUse } from './guestPlayersDb';
import { getMongoClient } from './mongodb';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

const COL = 'tournament_guest_players';

const GENDERS = new Set(['male', 'female']);

export async function createGuestPlayer(
  db: Db,
  tournamentId: string,
  actorId: string,
  body: { displayName?: unknown; gender?: unknown; note?: unknown },
): Promise<{ ok: true; doc: Record<string, unknown> } | { ok: false; error: string }> {
  const displayName = String(body.displayName ?? '').trim();
  const gender = String(body.gender ?? '').trim();
  const noteRaw = body.note;
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (!displayName || displayName.length > 200) return { ok: false, error: 'Invalid displayName' };
  if (!GENDERS.has(gender)) return { ok: false, error: 'Invalid gender' };
  const now = new Date().toISOString();
  const ins = await db.collection(COL).insertOne({
    tournamentId,
    displayName,
    gender,
    ...(note ? { note } : {}),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  const doc = await db.collection(COL).findOne({ _id: ins.insertedId });
  if (!doc) return { ok: false, error: 'Failed to create guest player' };
  return { ok: true, doc: doc as Record<string, unknown> };
}

export async function updateGuestPlayer(
  db: Db,
  tournamentId: string,
  guestId: string,
  body: { displayName?: unknown; gender?: unknown; note?: unknown },
): Promise<{ ok: true; doc: Record<string, unknown> } | { ok: false; error: string }> {
  if (!ObjectId.isValid(guestId)) return { ok: false, error: 'Invalid guest id' };
  const oid = new ObjectId(guestId);
  const existing = await db.collection(COL).findOne({ _id: oid, ...tournamentIdMongoFilter(tournamentId) });
  if (!existing) return { ok: false, error: 'Guest player not found' };
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName ?? '').trim();
    if (!displayName || displayName.length > 200) return { ok: false, error: 'Invalid displayName' };
    update.displayName = displayName;
  }
  if (body.gender !== undefined) {
    const gender = String(body.gender ?? '').trim();
    if (!GENDERS.has(gender)) return { ok: false, error: 'Invalid gender' };
    update.gender = gender;
  }
  if (body.note !== undefined) {
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    update.note = note || null;
  }
  if (Object.keys(update).length <= 1) return { ok: false, error: 'No valid fields to update' };
  await db.collection(COL).updateOne({ _id: oid, ...tournamentIdMongoFilter(tournamentId) }, { $set: update });
  const doc = await db.collection(COL).findOne({ _id: oid, ...tournamentIdMongoFilter(tournamentId) });
  return { ok: true, doc: doc as Record<string, unknown> };
}

export async function deleteGuestPlayer(
  db: Db,
  tournamentId: string,
  guestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ObjectId.isValid(guestId)) return { ok: false, error: 'Invalid guest id' };
  const gid = new ObjectId(guestId).toString();

  const tidf = tournamentIdMongoFilter(tournamentId);
  const guestOid = new ObjectId(guestId);
  const guestSlot = `guest:${gid}`;

  const inUse = await guestPlayerInUse(db, tournamentId, gid);
  if (!inUse) {
    const r = await db.collection(COL).deleteOne({ _id: guestOid, ...tidf });
    if (r.deletedCount === 0) return { ok: false, error: 'Guest player not found' };
    // Also clean up any orphan roster rows, if any exist.
    await db.collection('entries').deleteMany({ ...tidf, guestPlayerId: gid });
    return { ok: true };
  }

  // Guest is on a team: dissolve the team and move the remaining player back to "no team" roster.
  // Do this in a transaction to avoid partial state (team deleted but entries still pointing to it, etc).
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const teamsCol = db.collection('teams');
      const entriesCol = db.collection('entries');
      const guestCol = db.collection(COL);
      const now = new Date().toISOString();

      const team = await teamsCol.findOne({ ...tidf, playerIds: guestSlot }, { session });
      if (!team) {
        // Team disappeared between the inUse check and transaction; treat as normal delete.
        await guestCol.deleteOne({ _id: guestOid, ...tidf }, { session });
        await entriesCol.deleteMany({ ...tidf, guestPlayerId: gid }, { session });
        return;
      }
      const teamIdStr = (team._id as ObjectId).toString();

      await teamsCol.deleteOne({ _id: team._id as ObjectId }, { session });

      // Move any roster rows for that team back to "joined" without a team.
      await entriesCol.updateMany(
        { ...tidf, teamId: teamIdStr },
        { $set: { teamId: null, status: 'joined', updatedAt: now } },
        { session }
      );

      // Remove the deleted guest from roster entirely (so they disappear from Players tab).
      await entriesCol.deleteMany({ ...tidf, guestPlayerId: gid }, { session });

      const r = await guestCol.deleteOne({ _id: guestOid, ...tidf }, { session });
      if (r.deletedCount === 0) {
        throw new Error('Guest player not found');
      }
    });
    return { ok: true };
  } catch (e) {
    if (String((e as any)?.message ?? '').includes('Guest player not found')) {
      return { ok: false, error: 'Guest player not found' };
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

/**
 * Delete all guest players for a tournament (pre-start only).
 *
 * Notes:
 * - Guests may have been used in teams: those teams are deleted, any real users on those teams are moved back
 *   to a "joined" roster entry without a team, and guest roster entries are removed.
 */
export async function deleteAllGuestPlayers(
  db: Db,
  tournamentId: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const tidf = tournamentIdMongoFilter(tournamentId);
  const guestCol = db.collection(COL);
  const guests = await guestCol.find(tidf).project({ _id: 1 }).toArray();
  if (guests.length === 0) return { ok: true, deleted: 0 };

  const guestIds = guests.map((g) => String((g as { _id?: unknown })._id ?? '')).filter(Boolean);
  const guestSlots = guestIds.map((gid) => `guest:${gid}`);
  const now = new Date().toISOString();

  const client = await getMongoClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const teamsCol = db.collection('teams');
      const entriesCol = db.collection('entries');

      const teamsWithGuests = await teamsCol
        .find({ ...tidf, playerIds: { $in: guestSlots } }, { session })
        .project({ _id: 1 })
        .toArray();
      const teamIds = teamsWithGuests.map((t) => String((t as { _id?: unknown })._id ?? '')).filter(Boolean);

      if (teamIds.length > 0) {
        await teamsCol.deleteMany({ ...tidf, _id: { $in: teamIds.map((x) => new ObjectId(x)) } }, { session });
        await entriesCol.updateMany(
          { ...tidf, teamId: { $in: teamIds } },
          { $set: { teamId: null, status: 'joined', updatedAt: now } },
          { session }
        );
      }

      await entriesCol.deleteMany({ ...tidf, guestPlayerId: { $in: guestIds } }, { session });
      await guestCol.deleteMany({ ...tidf, _id: { $in: guestIds.map((x) => new ObjectId(x)) } }, { session });
    });
    return { ok: true, deleted: guests.length };
  } catch (e) {
    throw e;
  } finally {
    await session.endSession();
  }
}
