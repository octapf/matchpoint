import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

function fakeDbWithMatches(docs: Record<string, unknown>[]): Db {
  const matches = {
    find: () => ({
      toArray: async () => docs.map((d) => ({ ...d })),
    }),
    bulkWrite: async (ops: any[]) => {
      for (const op of ops) {
        const { filter, update } = op.updateOne;
        const doc = docs.find((d) => d._id === filter._id);
        if (!doc) continue;
        Object.assign(doc, update.$set ?? {});
        for (const key of Object.keys(update.$unset ?? {})) {
          delete doc[key];
        }
      }
    },
  };
  return {
    collection: (name: string) => {
      if (name !== 'matches') throw new Error(`Unexpected collection ${name}`);
      return matches;
    },
  } as unknown as Db;
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets every transitive downstream match after an upstream winner changes', async () => {
    const docs: Record<string, unknown>[] = [
      {
        _id: 'qf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'B',
        winnerId: 'B',
        status: 'completed',
      },
      {
        _id: 'qf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'gold',
        teamAId: 'C',
        teamBId: 'D',
        winnerId: 'C',
        status: 'completed',
      },
      {
        _id: 'sf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'C',
        winnerId: 'A',
        pointsA: 15,
        pointsB: 11,
        status: 'completed',
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
      {
        _id: 'sf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'gold',
        teamAId: 'E',
        teamBId: 'F',
        winnerId: 'E',
        status: 'completed',
      },
      {
        _id: 'final',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'E',
        winnerId: 'A',
        pointsA: 15,
        pointsB: 9,
        status: 'completed',
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
    ];

    await recomputeCategoryBracketAfterWinnerChange(fakeDbWithMatches(docs), 't1', 'men', 'gold', 'now', 'qf1');

    const sf1 = docs.find((d) => d._id === 'sf1')!;
    expect(sf1.status).toBe('scheduled');
    expect(sf1.teamAId).toBe('B');
    expect(sf1.teamBId).toBe('C');
    expect(sf1.winnerId).toBeUndefined();
    expect(sf1.pointsA).toBeUndefined();

    const final = docs.find((d) => d._id === 'final')!;
    expect(final.status).toBe('scheduled');
    expect(final.teamAId).toBeUndefined();
    expect(final.teamBId).toBe('E');
    expect(final.winnerId).toBeUndefined();
    expect(final.pointsA).toBeUndefined();
  });
});
