import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

describe('rebalanceTournamentTeams', () => {
  it('rejects started tournaments before changing team groups', async () => {
    let teamsTouched = false;
    const db = {
      collection: (name: string) => {
        if (name === 'tournaments') {
          return {
            findOne: async () => ({
              _id: '507f1f77bcf86cd799439011',
              maxTeams: 8,
              groupCount: 2,
              phase: 'classification',
            }),
          };
        }
        if (name === 'teams') {
          return {
            find: () => {
              teamsTouched = true;
              return { sort: () => ({ toArray: async () => [] }) };
            },
          };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
    } as unknown as Db;

    await expect(rebalanceTournamentTeams(db, '507f1f77bcf86cd799439011')).rejects.toThrow(
      'Tournament already started'
    );
    expect(teamsTouched).toBe(false);
  });
});
