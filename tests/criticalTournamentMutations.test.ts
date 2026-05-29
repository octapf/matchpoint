import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

function rebalanceDb(tournament: Record<string, unknown>, lockedMatches = 0) {
  const updates: unknown[] = [];
  const db = {
    collection(name: string) {
      if (name === 'tournaments') {
        return {
          findOne: async () => tournament,
        };
      }
      if (name === 'matches') {
        return {
          countDocuments: async () => lockedMatches,
        };
      }
      if (name === 'teams') {
        return {
          find: () => ({
            sort: () => ({
              toArray: async () => [],
            }),
          }),
          updateOne: async (...args: unknown[]) => {
            updates.push(args);
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  } as unknown as Db;
  return { db, updates };
}

describe('critical tournament mutation guards', () => {
  it('rejects group rebalancing once the tournament has started', async () => {
    const { db, updates } = rebalanceDb({ startedAt: '2026-05-29T10:00:00.000Z', phase: 'classification' });

    await expect(rebalanceTournamentTeams(db, '64f000000000000000000001')).rejects.toThrow('Tournament already started');
    expect(updates).toHaveLength(0);
  });

  it('rejects group rebalancing when any match has already been played', async () => {
    const { db, updates } = rebalanceDb({ phase: 'registration', maxTeams: 4, groupCount: 2 }, 1);

    await expect(rebalanceTournamentTeams(db, '64f000000000000000000001')).rejects.toThrow('Tournament already started');
    expect(updates).toHaveLength(0);
  });
});

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('clears downstream slots that depended on matches reset in the same recompute', async () => {
    const teamA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const teamB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const teamC = 'cccccccccccccccccccccccc';
    const teamD = 'dddddddddddddddddddddddd';
    const matches = [
      {
        _id: 'qf1',
        teamAId: teamA,
        teamBId: teamB,
        status: 'completed',
        winnerId: teamB,
      },
      {
        _id: 'sf1',
        teamAId: teamA,
        teamBId: teamC,
        status: 'completed',
        winnerId: teamC,
        pointsA: 19,
        pointsB: 21,
        advanceTeamAFromMatchId: 'qf1',
      },
      {
        _id: 'final',
        teamAId: teamC,
        teamBId: teamD,
        status: 'completed',
        winnerId: teamC,
        pointsA: 21,
        pointsB: 18,
        advanceTeamAFromMatchId: 'sf1',
      },
    ];
    const bulkWrites: any[] = [];
    const db = {
      collection(name: string) {
        expect(name).toBe('matches');
        return {
          find: () => ({
            toArray: async () => matches,
          }),
          bulkWrite: async (ops: any[]) => {
            bulkWrites.push(...ops);
          },
        };
      },
    } as unknown as Db;

    await recomputeCategoryBracketAfterWinnerChange(db, 't1', 'mixed', 'Gold', '2026-05-29T10:00:00.000Z', 'qf1');

    const byId = new Map(bulkWrites.map((op) => [op.updateOne.filter._id, op.updateOne.update]));
    expect([...byId.keys()].sort()).toEqual(['final', 'sf1']);

    const semiUpdate = byId.get('sf1');
    expect(semiUpdate.$set).toMatchObject({ status: 'scheduled', teamAId: teamB });
    expect(semiUpdate.$unset).toMatchObject({ winnerId: '', pointsA: '', pointsB: '' });

    const finalUpdate = byId.get('final');
    expect(finalUpdate.$set).toMatchObject({ status: 'scheduled', teamBId: teamD });
    expect(finalUpdate.$set.teamAId).toBeUndefined();
    expect(finalUpdate.$unset).toMatchObject({ teamAId: '', winnerId: '', pointsA: '', pointsB: '' });
  });
});
