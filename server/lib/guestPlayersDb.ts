import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { TournamentDivision } from '../../types';
import { isPairValidForTournamentDivisions } from './teamDivisionPairing';
import { parsePlayerSlot } from '../../lib/playerSlots';

const COL = 'tournament_guest_players';

export type GuestPlayerDoc = {
  _id: ObjectId;
  tournamentId: string;
  displayName: string;
  gender: string;
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export async function guestPlayerInUse(db: Db, tournamentId: string, guestId: string): Promise<boolean> {
  if (!ObjectId.isValid(guestId)) return false;
  const slot = `guest:${new ObjectId(guestId).toString()}`;
  const hit = await db.collection('teams').findOne({ tournamentId, playerIds: slot });
  return !!hit;
}

export async function assertGuestIdsBelongToTournament(
  db: Db,
  tournamentId: string,
  guestIds: string[],
): Promise<{ ok: true; docs: GuestPlayerDoc[] } | { ok: false; error: string }> {
  const oids = guestIds.filter((g) => ObjectId.isValid(g)).map((g) => new ObjectId(g));
  if (oids.length !== guestIds.length) {
    return { ok: false, error: 'Invalid guest player id' };
  }
  const docs = (await db
    .collection(COL)
    .find({ tournamentId, _id: { $in: oids } })
    .toArray()) as unknown as GuestPlayerDoc[];
  if (docs.length !== guestIds.length) {
    return { ok: false, error: 'Guest player not found for this tournament' };
  }
  return { ok: true, docs };
}

/** Resolve genders for two roster slots (user or guest) and compute pair division. */
export async function resolveTwoSlotGenders(
  db: Db,
  tournamentId: string,
  divisions: TournamentDivision[] | undefined,
  slotA: string,
  slotB: string,
): Promise<{ ok: true; pairDivision: TournamentDivision } | { ok: false; error: string }> {
  const s0 = parsePlayerSlot(slotA);
  const s1 = parsePlayerSlot(slotB);
  if (!s0 || !s1) return { ok: false, error: 'Invalid player id' };
  const usersCol = db.collection('users');
  let g0: string | undefined;
  let g1: string | undefined;
  if (s0.kind === 'user') {
    const u = await usersCol.findOne({ _id: new ObjectId(s0.userId) });
    if (!u) return { ok: false, error: 'Player not found' };
    g0 = typeof (u as { gender?: unknown }).gender === 'string' ? String((u as { gender?: string }).gender) : undefined;
  } else {
    const chk = await assertGuestIdsBelongToTournament(db, tournamentId, [s0.guestId]);
    if (!chk.ok) return { ok: false, error: chk.error };
    g0 = String((chk.docs[0] as { gender?: unknown }).gender ?? '');
  }
  if (s1.kind === 'user') {
    const u = await usersCol.findOne({ _id: new ObjectId(s1.userId) });
    if (!u) return { ok: false, error: 'Player not found' };
    g1 = typeof (u as { gender?: unknown }).gender === 'string' ? String((u as { gender?: string }).gender) : undefined;
  } else {
    const chk = await assertGuestIdsBelongToTournament(db, tournamentId, [s1.guestId]);
    if (!chk.ok) return { ok: false, error: chk.error };
    g1 = String((chk.docs[0] as { gender?: unknown }).gender ?? '');
  }
  const divCheck = isPairValidForTournamentDivisions(divisions, g0, g1);
  if (!divCheck.ok) return { ok: false, error: divCheck.reason };
  return { ok: true, pairDivision: divCheck.division };
}
