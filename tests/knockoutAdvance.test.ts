import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

function fakeDb(matches: Record<string, unknown>[], operations: unknown[]): Db {
  return {
    collection: (name: string) => {
      expect(name).toBe('matches');
      return {
        find: () => ({
          toArray: async () => matches,
        }),
        bulkWrite: async (ops: unknown[]) => {
          operations.push(...ops);
          return { ok: 1 };
        },
      };
    },
  } as unknown as Db;
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets all downstream rounds after an early knockout winner is changed', async () => {
    const qf1 = '000000000000000000000001';
    const qf2 = '000000000000000000000002';
    const sf1 = '000000000000000000000003';
    const sf2 = '000000000000000000000004';
    const final = '000000000000000000000005';
    const a = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const b = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const c = 'cccccccccccccccccccccccc';
    const d = 'dddddddddddddddddddddddd';
    const g = '999999999999999999999999';
    const h = '888888888888888888888888';
    const ops: unknown[] = [];

    const resetIds = await recomputeCategoryBracketAfterWinnerChange(
      fakeDb(
        [
          // qf1 has already been edited from B winning to A winning.
          { _id: qf1, teamAId: a, teamBId: b, status: 'completed', winnerId: a },
          { _id: qf2, teamAId: c, teamBId: d, status: 'completed', winnerId: c },
          {
            _id: sf1,
            teamAId: b,
            teamBId: c,
            status: 'completed',
            winnerId: b,
            pointsA: 21,
            pointsB: 19,
            advanceTeamAFromMatchId: qf1,
            advanceTeamBFromMatchId: qf2,
          },
          { _id: sf2, teamAId: g, teamBId: h, status: 'completed', winnerId: g },
          {
            _id: final,
            teamAId: b,
            teamBId: g,
            status: 'completed',
            winnerId: b,
            pointsA: 21,
            pointsB: 18,
            advanceTeamAFromMatchId: sf1,
            advanceTeamBFromMatchId: sf2,
          },
        ],
        ops
      ),
      'tournament',
      'mixed',
      'Gold',
      '2026-05-22T10:00:00.000Z',
      qf1
    );

    expect(resetIds).toEqual([sf1, final]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      updateOne: {
        filter: { _id: sf1 },
        update: {
          $set: { status: 'scheduled', teamAId: a, teamBId: c },
          $unset: { winnerId: '', pointsA: '', pointsB: '' },
        },
      },
    });
    expect(ops[1]).toMatchObject({
      updateOne: {
        filter: { _id: final },
        update: {
          $set: { status: 'scheduled', teamBId: g },
          $unset: { teamAId: '', winnerId: '', pointsA: '', pointsB: '' },
        },
      },
    });
  });
});
