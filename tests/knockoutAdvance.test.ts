import { describe, expect, it } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

type MatchDoc = Record<string, unknown> & { _id: string };

function fakeDb(matches: MatchDoc[]) {
  const bulkOps: unknown[] = [];

  return {
    db: {
      collection(name: string) {
        expect(name).toBe('matches');
        return {
          find() {
            return {
              toArray: async () => matches,
            };
          },
          bulkWrite: async (ops: unknown[]) => {
            bulkOps.push(...ops);
            return { ok: 1 };
          },
        };
      },
    },
    bulkOps,
  };
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets transitive downstream matches when an edited result invalidates a completed match', async () => {
    const matches: MatchDoc[] = [
      {
        _id: 'qf1',
        teamAId: 'teamA',
        teamBId: 'teamB',
        status: 'completed',
        winnerId: 'teamB',
        orderIndex: 0,
      },
      {
        _id: 'qf2',
        teamAId: 'teamC',
        teamBId: 'teamD',
        status: 'completed',
        winnerId: 'teamC',
        orderIndex: 1,
      },
      {
        _id: 'semi',
        teamAId: 'teamA',
        teamBId: 'teamC',
        status: 'completed',
        winnerId: 'teamA',
        pointsA: 21,
        pointsB: 17,
        setsWonA: 1,
        setsWonB: 0,
        orderIndex: 2,
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
      {
        _id: 'final',
        teamAId: 'teamA',
        teamBId: 'teamE',
        status: 'completed',
        winnerId: 'teamA',
        pointsA: 21,
        pointsB: 19,
        setsWonA: 1,
        setsWonB: 0,
        orderIndex: 3,
        advanceTeamAFromMatchId: 'semi',
      },
    ];
    const { db, bulkOps } = fakeDb(matches);

    await recomputeCategoryBracketAfterWinnerChange(
      db as never,
      'tournament1',
      'mixed',
      'Gold',
      '2026-05-02T10:00:00.000Z',
      'qf1'
    );

    expect(bulkOps).toHaveLength(2);
    expect(bulkOps).toContainEqual({
      updateOne: {
        filter: { _id: 'semi' },
        update: expect.objectContaining({
          $set: expect.objectContaining({ status: 'scheduled', teamAId: 'teamB' }),
          $unset: expect.objectContaining({ winnerId: '', pointsA: '', pointsB: '' }),
        }),
      },
    });
    expect(bulkOps).toContainEqual({
      updateOne: {
        filter: { _id: 'final' },
        update: expect.objectContaining({
          $set: expect.objectContaining({ status: 'scheduled', teamBId: 'teamE' }),
          $unset: expect.objectContaining({ teamAId: '', winnerId: '', pointsA: '', pointsB: '' }),
        }),
      },
    });
  });
});
