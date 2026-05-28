import { describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets every transitive downstream match after an edited winner changes', async () => {
    const now = '2026-05-28T10:00:00.000Z';
    const matches = [
      {
        _id: 'edited',
        teamAId: 'A',
        teamBId: 'B',
        winnerId: 'B',
        status: 'completed',
      },
      {
        _id: 'qf2',
        teamAId: 'C',
        teamBId: 'D',
        winnerId: 'C',
        status: 'completed',
      },
      {
        _id: 'sf1',
        teamAId: 'A',
        teamBId: 'C',
        winnerId: 'A',
        status: 'completed',
        advanceTeamAFromMatchId: 'edited',
        advanceTeamBFromMatchId: 'qf2',
      },
      {
        _id: 'sf2',
        teamAId: 'G',
        teamBId: 'H',
        winnerId: 'H',
        status: 'completed',
      },
      {
        _id: 'final',
        teamAId: 'A',
        teamBId: 'H',
        winnerId: 'A',
        status: 'completed',
        advanceTeamAFromMatchId: 'sf1',
        advanceTeamBFromMatchId: 'sf2',
      },
    ];
    const writes: any[] = [];
    const db = {
      collection: (name: string) => {
        expect(name).toBe('matches');
        return {
          find: () => ({ toArray: async () => matches }),
          bulkWrite: async (ops: any[]) => {
            writes.push(...ops);
            return {};
          },
        };
      },
    } as unknown as Db;

    await recomputeCategoryBracketAfterWinnerChange(db, 't1', 'mixed', 'Gold', now, 'edited');

    const updates = new Map(writes.map((op) => [op.updateOne.filter._id, op.updateOne.update]));
    expect([...updates.keys()].sort()).toEqual(['final', 'sf1']);
    expect(updates.get('sf1').$set).toMatchObject({
      teamAId: 'B',
      teamBId: 'C',
      status: 'scheduled',
      updatedAt: now,
    });
    expect(updates.get('sf1').$unset.winnerId).toBe('');

    expect(updates.get('final').$set).toMatchObject({
      teamBId: 'H',
      status: 'scheduled',
      updatedAt: now,
    });
    expect(updates.get('final').$unset.teamAId).toBe('');
    expect(updates.get('final').$unset.winnerId).toBe('');
  });
});
