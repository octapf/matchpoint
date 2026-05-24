import { describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { recomputeCategoryBracketAfterWinnerChange } from '../server/lib/knockoutAdvance';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

type Doc = Record<string, any>;

function sameValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual == null || expected == null) return false;
  return String(actual) === String(expected);
}

function matchesQuery(doc: Doc, query: Doc): boolean {
  return Object.entries(query).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return (expected.$in as unknown[]).some((value) => sameValue(actual, value));
      }
    }
    return sameValue(actual, expected);
  });
}

function applyUpdate(doc: Doc, update: Doc) {
  for (const [key, value] of Object.entries(update.$set ?? {})) {
    doc[key] = value;
  }
  for (const key of Object.keys(update.$unset ?? {})) {
    delete doc[key];
  }
}

class FakeCursor {
  constructor(private readonly docs: Doc[]) {}

  sort() {
    return this;
  }

  async toArray() {
    return this.docs;
  }
}

class FakeCollection {
  constructor(readonly docs: Doc[]) {}

  find(query: Doc = {}) {
    return new FakeCursor(this.docs.filter((doc) => matchesQuery(doc, query)));
  }

  async findOne(query: Doc) {
    return this.docs.find((doc) => matchesQuery(doc, query)) ?? null;
  }

  async countDocuments(query: Doc = {}) {
    return this.docs.filter((doc) => matchesQuery(doc, query)).length;
  }

  async updateOne(filter: Doc, update: Doc) {
    const doc = this.docs.find((candidate) => matchesQuery(candidate, filter));
    if (doc) applyUpdate(doc, update);
    return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
  }

  async bulkWrite(ops: Doc[]) {
    for (const op of ops) {
      const updateOne = op.updateOne;
      const doc = this.docs.find((candidate) => matchesQuery(candidate, updateOne.filter));
      if (doc) applyUpdate(doc, updateOne.update);
    }
    return { modifiedCount: ops.length };
  }
}

function fakeDb(collections: Record<string, FakeCollection>): Db {
  return {
    collection(name: string) {
      return collections[name];
    },
  } as unknown as Db;
}

describe('recomputeCategoryBracketAfterWinnerChange', () => {
  it('resets downstream matches transitively when an earlier winner changes', async () => {
    const matches = [
      {
        _id: 'm0',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'B',
        status: 'completed',
        winnerId: 'B',
        pointsA: 19,
        pointsB: 21,
      },
      {
        _id: 'm1',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'gold',
        teamAId: 'C',
        teamBId: 'D',
        status: 'completed',
        winnerId: 'C',
        pointsA: 21,
        pointsB: 12,
      },
      {
        _id: 'm2',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'C',
        status: 'completed',
        winnerId: 'A',
        pointsA: 21,
        pointsB: 18,
        advanceTeamAFromMatchId: 'm0',
        advanceTeamBFromMatchId: 'm1',
      },
      {
        _id: 'm3',
        tournamentId: 't1',
        stage: 'category',
        division: 'mixed',
        category: 'gold',
        teamAId: 'A',
        teamBId: 'G',
        status: 'completed',
        winnerId: 'A',
        pointsA: 21,
        pointsB: 14,
        advanceTeamAFromMatchId: 'm2',
      },
    ];

    const db = fakeDb({ matches: new FakeCollection(matches) });

    await recomputeCategoryBracketAfterWinnerChange(db, 't1', 'mixed', 'gold', '2026-05-24T10:00:00.000Z', 'm0');

    expect(matches[0]).toMatchObject({ status: 'completed', winnerId: 'B', teamAId: 'A', teamBId: 'B' });
    expect(matches[1]).toMatchObject({ status: 'completed', winnerId: 'C', teamAId: 'C', teamBId: 'D' });
    expect(matches[2]).toMatchObject({ status: 'scheduled', teamAId: 'B', teamBId: 'C' });
    expect(matches[2].winnerId).toBeUndefined();
    expect(matches[2].pointsA).toBeUndefined();
    expect(matches[2].pointsB).toBeUndefined();
    expect(matches[3]).toMatchObject({ status: 'scheduled', teamBId: 'G' });
    expect(matches[3].teamAId).toBeUndefined();
    expect(matches[3].winnerId).toBeUndefined();
    expect(matches[3].pointsA).toBeUndefined();
    expect(matches[3].pointsB).toBeUndefined();
  });
});

describe('rebalanceTournamentTeams', () => {
  it('rejects group rebalancing after the tournament has started', async () => {
    const tournamentId = new ObjectId().toString();
    const db = fakeDb({
      tournaments: new FakeCollection([
        {
          _id: new ObjectId(tournamentId),
          startedAt: '2026-05-24T10:00:00.000Z',
          phase: 'classification',
          maxTeams: 4,
          groupCount: 2,
        },
      ]),
      matches: new FakeCollection([]),
      teams: new FakeCollection([
        { _id: new ObjectId(), tournamentId, groupIndex: 0 },
        { _id: new ObjectId(), tournamentId, groupIndex: 1 },
      ]),
    });

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament already started');
  });
});
