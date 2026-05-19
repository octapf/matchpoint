import { ObjectId, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets transitive downstream matches after an earlier winner changes', async () => {
    const tournamentId = new ObjectId().toString();
    const qf1Id = new ObjectId().toString();
    const qf2Id = new ObjectId().toString();
    const sf1Id = new ObjectId().toString();
    const sf2Id = new ObjectId().toString();
    const finalId = new ObjectId().toString();
    const teamA = new ObjectId().toString();
    const teamB = new ObjectId().toString();
    const teamC = new ObjectId().toString();
    const teamD = new ObjectId().toString();
    const teamE = new ObjectId().toString();
    const teamF = new ObjectId().toString();
    const matches: Array<Record<string, unknown>> = [
      {
        _id: new ObjectId(qf1Id),
        teamAId: teamA,
        teamBId: teamB,
        status: 'completed',
        winnerId: teamA,
      },
      {
        _id: new ObjectId(qf2Id),
        teamAId: teamC,
        teamBId: teamD,
        status: 'completed',
        winnerId: teamC,
      },
      {
        _id: new ObjectId(sf1Id),
        teamAId: teamB,
        teamBId: teamC,
        status: 'completed',
        winnerId: teamB,
        pointsA: 21,
        pointsB: 18,
        advanceTeamAFromMatchId: qf1Id,
        advanceTeamBFromMatchId: qf2Id,
      },
      {
        _id: new ObjectId(sf2Id),
        teamAId: teamE,
        teamBId: teamF,
        status: 'completed',
        winnerId: teamE,
      },
      {
        _id: new ObjectId(finalId),
        teamAId: teamB,
        teamBId: teamE,
        status: 'completed',
        winnerId: teamB,
        pointsA: 21,
        pointsB: 19,
        advanceTeamAFromMatchId: sf1Id,
        advanceTeamBFromMatchId: sf2Id,
      },
    ];

    const byId = new Map(matches.map((m) => [String(m._id), m]));
    const bulkWrite = vi.fn(async (ops: Array<{ updateOne: { filter: { _id: ObjectId }; update: { $set: Record<string, unknown>; $unset: Record<string, unknown> } } }>) => {
      for (const op of ops) {
        const doc = byId.get(op.updateOne.filter._id.toString());
        if (!doc) continue;
        Object.assign(doc, op.updateOne.update.$set);
        for (const key of Object.keys(op.updateOne.update.$unset)) {
          delete doc[key];
        }
      }
      return { modifiedCount: ops.length };
    });
    const voidBets = vi.fn();
    const collections = {
      matches: {
        find: vi.fn(() => ({ toArray: async () => matches })),
        bulkWrite,
      },
      tournamentBets: {
        createIndex: vi.fn(async () => 'idx'),
        updateMany: voidBets,
      },
    };
    const db = {
      collection: (name: string) => collections[name as keyof typeof collections],
    } as unknown as Db;

    await recomputeCategoryBracketAfterWinnerChange(db, tournamentId, 'mixed', 'Gold', '2026-05-19T10:00:00.000Z', qf1Id);

    expect(byId.get(sf1Id)).toMatchObject({
      teamAId: teamA,
      teamBId: teamC,
      status: 'scheduled',
    });
    expect(byId.get(sf1Id)?.winnerId).toBeUndefined();
    expect(byId.get(finalId)).toMatchObject({
      teamBId: teamE,
      status: 'scheduled',
    });
    expect(byId.get(finalId)?.teamAId).toBeUndefined();
    expect(byId.get(finalId)?.winnerId).toBeUndefined();
    expect(voidBets).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId, matchId: { $in: expect.arrayContaining([sf1Id, finalId]) } }),
      expect.any(Object)
    );
  });
});
