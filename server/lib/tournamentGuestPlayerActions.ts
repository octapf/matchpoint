import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { guestPlayerInUse } from './guestPlayersDb';
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
  const inUse = await guestPlayerInUse(db, tournamentId, gid);
  if (inUse) return { ok: false, error: 'Guest is on a team; remove them from the team first' };
  const r = await db.collection(COL).deleteOne({ _id: new ObjectId(guestId), ...tournamentIdMongoFilter(tournamentId) });
  if (r.deletedCount === 0) return { ok: false, error: 'Guest player not found' };
  return { ok: true };
}
