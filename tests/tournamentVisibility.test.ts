import type { VercelRequest } from '@vercel/node';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { beforeAll, describe, expect, it } from 'vitest';
import { signSessionToken } from '../server/lib/sessionToken';
import { assertTournamentReadable } from '../server/lib/tournamentVisibility';

const tournamentId = new ObjectId().toString();
const organizerId = new ObjectId().toString();
const memberId = new ObjectId().toString();
const outsiderId = new ObjectId().toString();

function reqFor(userId?: string): VercelRequest {
  const headers = userId ? { authorization: `Bearer ${signSessionToken(userId)}` } : {};
  return { headers } as unknown as VercelRequest;
}

function fakeDb(tournament: Record<string, unknown>, opts?: { entryUserId?: string; waitlistUserId?: string }): Db {
  const entryUserId = opts?.entryUserId;
  const waitlistUserId = opts?.waitlistUserId;
  return {
    collection(name: string) {
      return {
        async findOne(query: Record<string, unknown>) {
          if (name === 'tournaments') {
            return String(query._id) === tournamentId ? tournament : null;
          }
          if (name === 'users') {
            return query._id instanceof ObjectId ? { _id: query._id } : null;
          }
          if (name === 'entries') {
            return entryUserId && query.userId === entryUserId ? { _id: new ObjectId(), userId: entryUserId } : null;
          }
          if (name === 'waitlist') {
            return waitlistUserId && query.userId === waitlistUserId
              ? { _id: new ObjectId(), userId: waitlistUserId }
              : null;
          }
          return null;
        },
      };
    },
  } as unknown as Db;
}

describe('assertTournamentReadable', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('allows public tournaments without a session', async () => {
    const db = fakeDb({ _id: new ObjectId(tournamentId), visibility: 'public' });

    const result = await assertTournamentReadable(reqFor(), db, tournamentId);

    expect(result.ok).toBe(true);
  });

  it('hides private tournaments from unauthenticated users', async () => {
    const db = fakeDb({ _id: new ObjectId(tournamentId), visibility: 'private' });

    const result = await assertTournamentReadable(reqFor(), db, tournamentId);

    expect(result).toEqual({ ok: false, status: 404, error: 'Tournament not found' });
  });

  it('hides private tournaments from authenticated outsiders', async () => {
    const db = fakeDb({ _id: new ObjectId(tournamentId), visibility: 'private' });

    const result = await assertTournamentReadable(reqFor(outsiderId), db, tournamentId);

    expect(result).toEqual({ ok: false, status: 404, error: 'Tournament not found' });
  });

  it('allows private tournaments for organizers', async () => {
    const db = fakeDb({
      _id: new ObjectId(tournamentId),
      visibility: 'private',
      organizerIds: [organizerId],
    });

    const result = await assertTournamentReadable(reqFor(organizerId), db, tournamentId);

    expect(result.ok).toBe(true);
  });

  it('allows private tournaments for registered entrants', async () => {
    const db = fakeDb({ _id: new ObjectId(tournamentId), visibility: 'private' }, { entryUserId: memberId });

    const result = await assertTournamentReadable(reqFor(memberId), db, tournamentId);

    expect(result.ok).toBe(true);
  });

  it('allows private tournaments for waitlisted users', async () => {
    const db = fakeDb({ _id: new ObjectId(tournamentId), visibility: 'private' }, { waitlistUserId: memberId });

    const result = await assertTournamentReadable(reqFor(memberId), db, tournamentId);

    expect(result.ok).toBe(true);
  });
});
