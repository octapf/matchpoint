import { ObjectId, type Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

function fakeDbForRebalance(tournament: Record<string, unknown>, teams: Record<string, unknown>[]): Db {
  const collections = {
    tournaments: {
      findOne: async () => tournament,
    },
    matches: {
      countDocuments: async () => 0,
    },
    teams: {
      find: () => ({
        sort: () => ({
          toArray: async () => teams,
        }),
      }),
      bulkWrite: async (ops: any[]) => {
        for (const op of ops) {
          const { filter, update } = op.updateOne;
          const doc = teams.find((tm) => tm._id === filter._id);
          if (doc) Object.assign(doc, update.$set ?? {});
        }
      },
    },
  };
  return {
    collection: (name: string) => (collections as any)[name],
  } as unknown as Db;
}

describe('rebalanceTournamentTeams', () => {
  it('keeps each division inside its own group-index slice', async () => {
    const tournamentId = new ObjectId().toString();
    const teams = [
      { _id: new ObjectId(), tournamentId, division: 'men', groupIndex: 3, createdAt: '1' },
      { _id: new ObjectId(), tournamentId, division: 'men', groupIndex: 3, createdAt: '2' },
      { _id: new ObjectId(), tournamentId, division: 'men', groupIndex: 3, createdAt: '3' },
      { _id: new ObjectId(), tournamentId, division: 'men', groupIndex: 3, createdAt: '4' },
      { _id: new ObjectId(), tournamentId, division: 'women', groupIndex: 0, createdAt: '5' },
      { _id: new ObjectId(), tournamentId, division: 'women', groupIndex: 0, createdAt: '6' },
      { _id: new ObjectId(), tournamentId, division: 'women', groupIndex: 0, createdAt: '7' },
      { _id: new ObjectId(), tournamentId, division: 'women', groupIndex: 0, createdAt: '8' },
    ];
    const db = fakeDbForRebalance(
      {
        _id: new ObjectId(tournamentId),
        maxTeams: 8,
        groupCount: 4,
        divisions: ['men', 'women'],
      },
      teams
    );

    const result = await rebalanceTournamentTeams(db, tournamentId);

    expect(result.teams).toBe(8);
    expect(teams.slice(0, 4).map((tm) => tm.groupIndex)).toEqual([0, 0, 1, 1]);
    expect(teams.slice(4).map((tm) => tm.groupIndex)).toEqual([2, 2, 3, 3]);
  });
});
