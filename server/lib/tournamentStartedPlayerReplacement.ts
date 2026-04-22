import type { ClientSession, Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { getMongoClient } from './mongodb';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';
import { toGuestPlayerSlot } from '../../lib/playerSlots';

function tournamentStartedFromDoc(doc: Record<string, unknown> | null): boolean {
  if (!doc) return false;
  const startedAt = (doc as { startedAt?: unknown }).startedAt;
  const phase = String((doc as { phase?: unknown }).phase ?? '');
  return !!startedAt || phase === 'classification' || phase === 'categories' || phase === 'completed';
}

function displayNameFromUser(u: Record<string, unknown>): string {
  const username = typeof u.username === 'string' ? u.username.trim() : '';
  if (username) return username;
  const legacy = typeof u.displayName === 'string' ? u.displayName.trim() : '';
  if (legacy) return legacy;
  const first = typeof u.firstName === 'string' ? u.firstName.trim() : '';
  const last = typeof u.lastName === 'string' ? u.lastName.trim() : '';
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full || 'Player';
}

function genderFromUser(u: Record<string, unknown>): 'male' | 'female' {
  const g = typeof u.gender === 'string' ? u.gender.trim() : '';
  return g === 'female' ? 'female' : 'male';
}

/**
 * Tournament started: a leaving registered user is replaced by a guest player
 * (clone name + gender) to preserve team/match integrity.
 *
 * Invariants:
 * - does NOT remove/dissolve teams
 * - updates `teams.playerIds`, `entries`, and existing `matches.serveOrder` references
 */
export async function replaceLeavingUserWithGuest(
  db: Db,
  tournamentId: string,
  userId: string,
  opts?: { session?: ClientSession }
): Promise<{ ok: true; guestId: string; guestSlot: string } | { ok: false; error: string }> {
  if (!ObjectId.isValid(tournamentId)) return { ok: false, error: 'Invalid tournament ID' };
  if (!ObjectId.isValid(userId)) return { ok: false, error: 'Invalid userId' };

  const tidf = tournamentIdMongoFilter(tournamentId);
  const tournamentsCol = db.collection('tournaments');
  const tour = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!tour) return { ok: false, error: 'Tournament not found' };
  if (!tournamentStartedFromDoc(tour as Record<string, unknown>)) {
    return { ok: false, error: 'Tournament has not started' };
  }

  const usersCol = db.collection('users');
  const u = await usersCol.findOne({ _id: new ObjectId(userId) });
  if (!u) return { ok: false, error: 'Player not found' };

  const displayName = displayNameFromUser(u as Record<string, unknown>);
  const gender = genderFromUser(u as Record<string, unknown>);

  const client = await getMongoClient();
  const session = opts?.session ?? client.startSession();
  const ownsSession = !opts?.session;
  try {
    const out = await session.withTransaction(async () => {
      const tdb = client.db('matchpoint');
      const teamsCol = tdb.collection('teams');
      const entriesCol = tdb.collection('entries');
      const guestsCol = tdb.collection('tournament_guest_players');
      const matchesCol = tdb.collection('matches');
      const waitlistCol = tdb.collection('waitlist');

      const now = new Date().toISOString();

      const team = await teamsCol.findOne({ ...tidf, playerIds: userId }, { session });
      const teamIdStr = team ? String((team as any)._id) : null;

      const ins = await guestsCol.insertOne(
        {
          tournamentId,
          displayName,
          gender,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      const guestId = String(ins.insertedId);
      const guestSlot = toGuestPlayerSlot(guestId);

      if (team) {
        const pids: string[] = Array.isArray((team as any).playerIds) ? (team as any).playerIds.map(String).filter(Boolean) : [];
        const nextPids = pids.map((pid) => (pid === userId ? guestSlot : pid));
        await teamsCol.updateOne({ _id: (team as any)._id }, { $set: { playerIds: nextPids, updatedAt: now } }, { session });
      }

      // Remove the registered user's roster rows and replace with a guest roster row.
      await entriesCol.deleteMany({ ...tidf, userId }, { session });
      await entriesCol.deleteMany({ ...tidf, guestPlayerId: guestId }, { session });

      await entriesCol.insertOne(
        {
          tournamentId,
          // Keep unique index on (tournamentId, userId) satisfied using the guest slot string.
          userId: guestSlot,
          guestPlayerId: guestId,
          teamId: teamIdStr,
          status: teamIdStr ? 'in_team' : 'joined',
          lookingForPartner: false,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );

      // Remove waitlist rows for the leaving user (not meaningful after start).
      await waitlistCol.deleteMany({ ...tidf, userId }, { session });

      // Update any serve order references in matches (so referee validation doesn't break).
      await matchesCol.updateMany(
        { tournamentId, serveOrder: { $exists: true } },
        [
          {
            $set: {
              serveOrder: {
                $map: {
                  input: '$serveOrder',
                  as: 'pid',
                  in: { $cond: [{ $eq: ['$$pid', userId] }, guestSlot, '$$pid'] },
                },
              },
              servingPlayerId: {
                $cond: [{ $eq: ['$servingPlayerId', userId] }, guestSlot, '$servingPlayerId'],
              },
              updatedAt: now,
            },
          },
        ] as any,
        { session }
      );

      return { guestId, guestSlot };
    });

    return { ok: true, guestId: out.guestId, guestSlot: out.guestSlot };
  } catch (e) {
    console.error('[replaceLeavingUserWithGuest] failed', e);
    return { ok: false, error: 'Internal server error' };
  } finally {
    if (ownsSession) await session.endSession();
  }
}

