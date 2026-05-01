import { describe, expect, it } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets every downstream match after a completed upstream winner changes', async () => {
    const updates: Array<{ filter: unknown; update: { $set: Record<string, unknown>; $unset: Record<string, unknown> } }> = [];
    const matches = [
      {
        _id: 'qf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        bracketRound: 1,
        orderIndex: 0,
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: 'completed',
        winnerId: 'team-b',
      },
      {
        _id: 'qf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        bracketRound: 1,
        orderIndex: 1,
        teamAId: 'team-c',
        teamBId: 'team-d',
        status: 'completed',
        winnerId: 'team-c',
      },
      {
        _id: 'sf1',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        bracketRound: 2,
        orderIndex: 0,
        teamAId: 'team-a',
        teamBId: 'team-c',
        status: 'completed',
        winnerId: 'team-a',
        pointsA: 21,
        pointsB: 10,
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
      {
        _id: 'sf2',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        bracketRound: 2,
        orderIndex: 1,
        teamAId: 'team-e',
        teamBId: 'team-f',
        status: 'completed',
        winnerId: 'team-e',
      },
      {
        _id: 'final',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'Gold',
        bracketRound: 3,
        orderIndex: 0,
        teamAId: 'team-a',
        teamBId: 'team-e',
        status: 'completed',
        winnerId: 'team-a',
        pointsA: 21,
        pointsB: 19,
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
    ];

    const db = {
      collection: () => ({
        find: () => ({
          toArray: async () => matches,
        }),
        bulkWrite: async (ops: typeof updates) => {
          updates.push(...ops);
        },
      }),
    };

    await recomputeCategoryBracketAfterWinnerChange(db as any, 't1', 'mixed', 'Gold', '2026-05-01T10:00:00.000Z', 'qf1');

    expect(updates).toHaveLength(2);

    const byId = new Map(
      updates.map((op) => [String((op.filter as { _id: unknown })._id), op.update])
    );

    expect(byId.get('sf1')?.$set).toMatchObject({
      status: 'scheduled',
      teamAId: 'team-b',
      teamBId: 'team-c',
    });
    expect(byId.get('sf1')?.$unset).toMatchObject({
      winnerId: '',
      pointsA: '',
      pointsB: '',
    });

    expect(byId.get('final')?.$set).toMatchObject({
      status: 'scheduled',
      teamBId: 'team-e',
    });
    expect(byId.get('final')?.$unset).toMatchObject({
      teamAId: '',
      winnerId: '',
      pointsA: '',
      pointsB: '',
    });
  });
});
