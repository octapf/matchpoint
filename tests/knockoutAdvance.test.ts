import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

function makeDb(matches: Record<string, any>[]): Db {
  return {
    collection(name: string) {
      expect(name).toBe('matches');
      return {
        find() {
          return {
            async toArray() {
              return matches.map((m) => ({ ...m }));
            },
          };
        },
        async bulkWrite(ops: any[]) {
          for (const op of ops) {
            const { filter, update } = op.updateOne;
            const doc = matches.find((m) => m._id === filter._id);
            expect(doc).toBeTruthy();
            Object.assign(doc!, update.$set ?? {});
            for (const field of Object.keys(update.$unset ?? {})) {
              delete doc![field];
            }
          }
          return { modifiedCount: ops.length };
        },
      };
    },
  } as unknown as Db;
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets transitive downstream matches when an upstream winner changes', async () => {
    const now = '2026-05-27T10:00:00.000Z';
    const matches: Record<string, any>[] = [
      {
        _id: 'qf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'Gold',
        teamAId: 'team-1',
        teamBId: 'team-2',
        status: 'completed',
        winnerId: 'team-2',
      },
      {
        _id: 'qf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'Gold',
        teamAId: 'team-3',
        teamBId: 'team-4',
        status: 'completed',
        winnerId: 'team-3',
      },
      {
        _id: 'sf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'Gold',
        teamAId: 'team-5',
        teamBId: 'team-6',
        status: 'completed',
        winnerId: 'team-5',
      },
      // The final appears before sf1 to prove recomputation is not dependent on DB order.
      {
        _id: 'final',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'Gold',
        teamAId: 'team-1',
        teamBId: 'team-5',
        status: 'completed',
        winnerId: 'team-1',
        pointsA: 6,
        pointsB: 4,
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
      {
        _id: 'sf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'men',
        category: 'Gold',
        teamAId: 'team-1',
        teamBId: 'team-3',
        status: 'completed',
        winnerId: 'team-1',
        pointsA: 6,
        pointsB: 2,
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
    ];

    const resetIds = await recomputeCategoryBracketAfterWinnerChange(
      makeDb(matches),
      't1',
      'men',
      'Gold',
      now,
      'qf1'
    );

    expect(new Set(resetIds)).toEqual(new Set(['sf1', 'final']));

    const sf1 = matches.find((m) => m._id === 'sf1')!;
    expect(sf1).toMatchObject({
      teamAId: 'team-2',
      teamBId: 'team-3',
      status: 'scheduled',
      updatedAt: now,
    });
    expect(sf1.winnerId).toBeUndefined();
    expect(sf1.pointsA).toBeUndefined();
    expect(sf1.pointsB).toBeUndefined();

    const final = matches.find((m) => m._id === 'final')!;
    expect(final).toMatchObject({
      teamBId: 'team-5',
      status: 'scheduled',
      updatedAt: now,
    });
    expect(final.teamAId).toBeUndefined();
    expect(final.winnerId).toBeUndefined();
    expect(final.pointsA).toBeUndefined();
    expect(final.pointsB).toBeUndefined();
  });
});
