import { describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';
import { deleteGuestPlayer } from '../server/lib/tournamentGuestPlayerActions';

type CollectionMock = Record<string, (...args: any[]) => any>;

function mockDb(collections: Record<string, CollectionMock>): Db {
  return {
    collection: (name: string) => {
      const col = collections[name];
      if (!col) throw new Error(`Unexpected collection ${name}`);
      return col;
    },
  } as unknown as Db;
}

describe('tournament structural mutation guards', () => {
  it('rejects guest deletion after tournament start before removing guest data', async () => {
    const tournamentId = new ObjectId().toString();
    const guestId = new ObjectId().toString();
    let guestDeletes = 0;

    const db = mockDb({
      tournaments: {
        findOne: async () => ({ _id: new ObjectId(tournamentId), startedAt: '2026-05-09T10:00:00.000Z' }),
      },
      tournament_guest_players: {
        deleteOne: async () => {
          guestDeletes++;
          return { deletedCount: 1 };
        },
      },
    });

    await expect(deleteGuestPlayer(db, tournamentId, guestId)).resolves.toEqual({
      ok: false,
      error: 'Tournament already started',
    });
    expect(guestDeletes).toBe(0);
  });

  it('rejects group rebalancing after tournament start before updating teams', async () => {
    const tournamentId = new ObjectId().toString();
    let teamUpdates = 0;
    let matchCounts = 0;

    const db = mockDb({
      tournaments: {
        findOne: async () => ({ _id: new ObjectId(tournamentId), phase: 'classification' }),
      },
      matches: {
        countDocuments: async () => {
          matchCounts++;
          return 0;
        },
      },
      teams: {
        updateOne: async () => {
          teamUpdates++;
          return { modifiedCount: 1 };
        },
      },
    });

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament already started');
    expect(matchCounts).toBe(0);
    expect(teamUpdates).toBe(0);
  });

  it('rejects group rebalancing once any match has started', async () => {
    const tournamentId = new ObjectId().toString();
    let teamUpdates = 0;

    const db = mockDb({
      tournaments: {
        findOne: async () => ({ _id: new ObjectId(tournamentId), phase: 'registration', maxTeams: 4, groupCount: 2 }),
      },
      matches: {
        countDocuments: async () => 1,
      },
      teams: {
        updateOne: async () => {
          teamUpdates++;
          return { modifiedCount: 1 };
        },
      },
    });

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament already started');
    expect(teamUpdates).toBe(0);
  });
});
