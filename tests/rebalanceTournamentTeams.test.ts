import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

describe('rebalanceTournamentTeams', () => {
  it('rejects group reassignment after the tournament has started', async () => {
    let teamsTouched = false;
    const db = {
      collection(name: string) {
        if (name === 'tournaments') {
          return {
            findOne: async () => ({
              _id: '507f1f77bcf86cd799439011',
              phase: 'classification',
              maxTeams: 4,
              groupCount: 2,
            }),
          };
        }
        if (name === 'teams') {
          teamsTouched = true;
          return {
            find: () => ({
              sort: () => ({
                toArray: async () => [],
              }),
            }),
            updateOne: async () => undefined,
          };
        }
        if (name === 'matches') {
          return { countDocuments: async () => 0 };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    } as unknown as Db;

    await expect(rebalanceTournamentTeams(db, '507f1f77bcf86cd799439011')).rejects.toThrow(
      'Tournament has started'
    );
    expect(teamsTouched).toBe(false);
  });
});
