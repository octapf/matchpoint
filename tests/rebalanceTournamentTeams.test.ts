import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

describe('rebalanceTournamentTeams', () => {
  it('rejects tournaments that have already started', async () => {
    const tournamentId = new ObjectId().toString();
    const db = {
      collection(name: string) {
        if (name === 'tournaments') {
          return {
            async findOne() {
              return { _id: new ObjectId(tournamentId), startedAt: '2026-05-21T10:00:00.000Z' };
            },
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    };

    await expect(rebalanceTournamentTeams(db as any, tournamentId)).rejects.toThrow('Tournament has started');
  });

  it('rejects tournaments with started or completed matches even if tournament phase is stale', async () => {
    const tournamentId = new ObjectId().toString();
    const db = {
      collection(name: string) {
        if (name === 'tournaments') {
          return {
            async findOne() {
              return { _id: new ObjectId(tournamentId), phase: 'registration', maxTeams: 4, groupCount: 2 };
            },
          };
        }
        if (name === 'matches') {
          return {
            async countDocuments() {
              return 1;
            },
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    };

    await expect(rebalanceTournamentTeams(db as any, tournamentId)).rejects.toThrow('Tournament has started');
  });
});
