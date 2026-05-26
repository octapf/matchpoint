import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

type MatchDoc = Record<string, unknown> & { _id: string };
type BulkUpdate = {
  updateOne: {
    filter: { _id: string };
    update: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, unknown>;
    };
  };
};

function mockDbWithMatches(matches: MatchDoc[]) {
  const bulkWrites: BulkUpdate[][] = [];
  const db = {
    collection(name: string) {
      if (name !== 'matches') throw new Error(`Unexpected collection ${name}`);
      return {
        find() {
          return {
            toArray: async () => matches.map((m) => ({ ...m })),
          };
        },
        bulkWrite: async (ops: BulkUpdate[]) => {
          bulkWrites.push(ops);
          for (const op of ops) {
            const doc = matches.find((m) => m._id === op.updateOne.filter._id);
            if (!doc) continue;
            for (const [k, v] of Object.entries(op.updateOne.update.$set ?? {})) {
              doc[k] = v;
            }
            for (const k of Object.keys(op.updateOne.update.$unset ?? {})) {
              delete doc[k];
            }
          }
          return { modifiedCount: ops.length };
        },
      };
    },
  } as unknown as Db;

  return { db, bulkWrites };
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets completed grandchildren when an edited upstream winner invalidates their feeder', async () => {
    const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const C = 'cccccccccccccccccccccccc';
    const D = 'dddddddddddddddddddddddd';
    const E = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const F = 'ffffffffffffffffffffffff';
    const now = '2026-05-26T10:00:00.000Z';
    const matches: MatchDoc[] = [
      {
        _id: 'qf1',
        tournamentId: 't',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: A,
        teamBId: B,
        status: 'completed',
        winnerId: A,
        pointsA: 21,
        pointsB: 19,
      },
      {
        _id: 'qf2',
        tournamentId: 't',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: C,
        teamBId: D,
        status: 'completed',
        winnerId: C,
        pointsA: 21,
        pointsB: 18,
      },
      {
        _id: 'sf1',
        tournamentId: 't',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: B,
        teamBId: C,
        status: 'completed',
        winnerId: B,
        pointsA: 21,
        pointsB: 17,
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
      {
        _id: 'sf2',
        tournamentId: 't',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: E,
        teamBId: F,
        status: 'completed',
        winnerId: E,
        pointsA: 21,
        pointsB: 14,
      },
      {
        _id: 'final',
        tournamentId: 't',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: B,
        teamBId: E,
        status: 'completed',
        winnerId: B,
        pointsA: 21,
        pointsB: 16,
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
    ];
    const { db, bulkWrites } = mockDbWithMatches(matches);

    await recomputeCategoryBracketAfterWinnerChange(db, 't', 'mixed', 'Gold', now, 'qf1');

    const sf1 = matches.find((m) => m._id === 'sf1');
    const final = matches.find((m) => m._id === 'final');
    expect(bulkWrites).toHaveLength(1);
    expect(sf1).toMatchObject({
      teamAId: A,
      teamBId: C,
      status: 'scheduled',
      updatedAt: now,
    });
    expect(sf1?.winnerId).toBeUndefined();
    expect(sf1?.pointsA).toBeUndefined();
    expect(final).toMatchObject({
      teamBId: E,
      status: 'scheduled',
      updatedAt: now,
    });
    expect(final?.teamAId).toBeUndefined();
    expect(final?.winnerId).toBeUndefined();
    expect(final?.pointsA).toBeUndefined();
  });
});
