import { describe, expect, it } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

type TestMatch = Record<string, unknown> & { _id: string };

function createDb(matches: TestMatch[]) {
  return {
    collection(name: string) {
      if (name !== 'matches') throw new Error(`Unexpected collection ${name}`);
      return {
        find(filter: Record<string, unknown>) {
          return {
            async toArray() {
              return matches
                .filter(
                  (m) =>
                    m.tournamentId === filter.tournamentId &&
                    m.stage === filter.stage &&
                    m.division === filter.division &&
                    m.category === filter.category
                )
                .map((m) => ({ ...m }));
            },
          };
        },
        async bulkWrite(ops: { updateOne: { filter: { _id: string }; update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> } } }[]) {
          for (const op of ops) {
            const doc = matches.find((m) => m._id === op.updateOne.filter._id);
            if (!doc) continue;
            Object.assign(doc, op.updateOne.update.$set ?? {});
            for (const key of Object.keys(op.updateOne.update.$unset ?? {})) {
              delete doc[key];
            }
          }
        },
      };
    },
  };
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets transitive downstream matches when an edited winner invalidates a feeder', async () => {
    const matches: TestMatch[] = [
      {
        _id: 'qf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: 'completed',
        winnerId: 'team-b',
      },
      {
        _id: 'sf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: 'team-a',
        teamBId: 'team-c',
        status: 'completed',
        winnerId: 'team-a',
        pointsA: 21,
        pointsB: 14,
        setsWonA: 1,
        setsWonB: 0,
        completedAt: 'before',
        advanceTeamAFromMatchId: 'qf1',
      },
      {
        _id: 'final',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        teamAId: 'team-a',
        teamBId: 'team-d',
        status: 'completed',
        winnerId: 'team-a',
        pointsA: 21,
        pointsB: 19,
        setsWonA: 1,
        setsWonB: 0,
        completedAt: 'before',
        advanceTeamAFromMatchId: 'sf1',
      },
    ];

    await recomputeCategoryBracketAfterWinnerChange(createDb(matches) as never, 't1', 'mixed', 'Gold', 'now', 'qf1');

    const sf = matches.find((m) => m._id === 'sf1')!;
    expect(sf.status).toBe('scheduled');
    expect(sf.teamAId).toBe('team-b');
    expect(sf.teamBId).toBe('team-c');
    expect(sf.winnerId).toBeUndefined();
    expect(sf.pointsA).toBeUndefined();
    expect(sf.completedAt).toBeUndefined();

    const final = matches.find((m) => m._id === 'final')!;
    expect(final.status).toBe('scheduled');
    expect(final.teamAId).toBeUndefined();
    expect(final.teamBId).toBe('team-d');
    expect(final.winnerId).toBeUndefined();
    expect(final.pointsA).toBeUndefined();
    expect(final.completedAt).toBeUndefined();
  });
});
