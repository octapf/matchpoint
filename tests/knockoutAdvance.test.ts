import { describe, expect, it } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets matches transitively when an upstream winner edit invalidates a completed feeder', async () => {
    const updatedAt = '2026-05-21T10:00:00.000Z';
    const tournamentId = 't1';
    const division = 'mixed';
    const category = 'gold';
    const teamA = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const teamB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const teamC = 'cccccccccccccccccccccccc';
    const teamD = 'dddddddddddddddddddddddd';
    const teamE = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const teamF = 'ffffffffffffffffffffffff';

    const matches = [
      {
        _id: 'qf1',
        teamAId: teamA,
        teamBId: teamB,
        status: 'completed',
        winnerId: teamB,
      },
      {
        _id: 'qf2',
        teamAId: teamC,
        teamBId: teamD,
        status: 'completed',
        winnerId: teamC,
      },
      {
        _id: 'sf2',
        teamAId: teamE,
        teamBId: teamF,
        status: 'completed',
        winnerId: teamE,
      },
      {
        _id: 'final',
        teamAId: teamA,
        teamBId: teamE,
        status: 'completed',
        winnerId: teamA,
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
      {
        _id: 'sf1',
        teamAId: teamA,
        teamBId: teamC,
        status: 'completed',
        winnerId: teamA,
        advanceTeamAFromMatchId: 'qf1',
        advanceTeamBFromMatchId: 'qf2',
      },
    ];

    const bulkOps: any[] = [];
    const db = {
      collection(name: string) {
        expect(name).toBe('matches');
        return {
          find() {
            return {
              async toArray() {
                return matches;
              },
            };
          },
          async bulkWrite(ops: any[]) {
            bulkOps.push(...ops);
          },
        };
      },
    };

    await recomputeCategoryBracketAfterWinnerChange(db as any, tournamentId, division, category, updatedAt, 'qf1');

    const opById = new Map(bulkOps.map((op) => [op.updateOne.filter._id, op.updateOne.update]));
    expect([...opById.keys()].sort()).toEqual(['final', 'sf1']);
    expect(opById.get('sf1')).toMatchObject({
      $set: { status: 'scheduled', updatedAt, teamAId: teamB, teamBId: teamC },
      $unset: { winnerId: '' },
    });
    expect(opById.get('final')).toMatchObject({
      $set: { status: 'scheduled', updatedAt, teamBId: teamE },
      $unset: { winnerId: '', teamAId: '' },
    });
  });
});
