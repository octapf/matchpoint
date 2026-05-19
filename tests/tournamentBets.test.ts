import { ObjectId, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { settleBetsForMatch } from '../server/lib/tournamentBets';

describe('settleBetsForMatch', () => {
  it('keeps bets pending while the match is still live', async () => {
    const tournamentId = new ObjectId().toString();
    const matchId = new ObjectId().toString();
    const bets = [
      {
        _id: new ObjectId(),
        tournamentId,
        matchId,
        userId: new ObjectId().toString(),
        kind: 'winner',
        status: 'pending',
        pointsAwarded: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const updateMany = vi.fn();
    const collections = {
      matches: {
        findOne: vi.fn(async () => ({
          _id: new ObjectId(matchId),
          tournamentId,
          status: 'in_progress',
        })),
      },
      tournamentBets: {
        createIndex: vi.fn(async () => 'idx'),
        find: vi.fn(() => ({ toArray: async () => bets })),
        updateMany,
      },
    };
    const db = {
      collection: (name: string) => collections[name as keyof typeof collections],
    } as unknown as Db;

    await settleBetsForMatch(db, tournamentId, matchId);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
