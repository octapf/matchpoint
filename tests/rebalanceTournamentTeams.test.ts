import { ObjectId, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

function dbForRebalance(tournament: Record<string, unknown>, teams: Array<Record<string, unknown>>, lockedMatches = 0): Db {
  const collections = {
    tournaments: {
      findOne: vi.fn(async () => tournament),
    },
    matches: {
      countDocuments: vi.fn(async () => lockedMatches),
    },
    teams: {
      find: vi.fn(() => ({
        sort: () => ({
          toArray: async () => teams,
        }),
      })),
      bulkWrite: vi.fn(async (ops: Array<{ updateOne: { filter: { _id: ObjectId }; update: { $set: Record<string, unknown> } } }>) => {
        const byId = new Map(teams.map((t) => [String(t._id), t]));
        for (const op of ops) {
          Object.assign(byId.get(op.updateOne.filter._id.toString()) ?? {}, op.updateOne.update.$set);
        }
        return { modifiedCount: ops.length };
      }),
    },
  };
  return {
    collection: (name: string) => collections[name as keyof typeof collections],
  } as unknown as Db;
}

describe('rebalanceTournamentTeams', () => {
  it('keeps teams inside their division group slice', async () => {
    const tournamentId = new ObjectId().toString();
    const tournament = {
      _id: new ObjectId(tournamentId),
      tournamentId,
      maxTeams: 8,
      groupCount: 4,
      divisions: ['men', 'women'],
      phase: 'registration',
    };
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

    await rebalanceTournamentTeams(dbForRebalance(tournament, teams), tournamentId);

    expect(teams.filter((t) => t.division === 'men').map((t) => t.groupIndex)).toEqual([0, 0, 1, 1]);
    expect(teams.filter((t) => t.division === 'women').map((t) => t.groupIndex)).toEqual([2, 2, 3, 3]);
  });

  it('rejects rebalancing after tournament start', async () => {
    const tournamentId = new ObjectId().toString();
    const tournament = {
      _id: new ObjectId(tournamentId),
      maxTeams: 8,
      groupCount: 4,
      divisions: ['men', 'women'],
      phase: 'classification',
    };

    await expect(rebalanceTournamentTeams(dbForRebalance(tournament, []), tournamentId)).rejects.toThrow('Tournament has started');
  });
});
