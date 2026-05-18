import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';

type Doc = Record<string, unknown> & { _id?: ObjectId };

class FindCursor {
  constructor(private readonly docs: Doc[]) {}

  sort() {
    return this;
  }

  project() {
    return this;
  }

  async toArray() {
    return this.docs.map((d) => ({ ...d }));
  }
}

function matchesFilter(doc: Doc, filter: Record<string, unknown>): boolean {
  for (const [key, raw] of Object.entries(filter)) {
    const value = doc[key];
    if (raw && typeof raw === 'object' && '$in' in raw) {
      const list = (raw as { $in: unknown[] }).$in;
      if (!list.includes(value)) return false;
      continue;
    }
    if (value !== raw) return false;
  }
  return true;
}

function makeDb({
  tournament,
  teams,
  matches,
}: {
  tournament: Doc;
  teams: Doc[];
  matches: Doc[];
}) {
  const tournaments = [tournament];
  const collections = {
    tournaments: {
      async findOne() {
        return tournaments[0] ? { ...tournaments[0] } : null;
      },
      async updateOne(_filter: Record<string, unknown>, update: Record<string, Doc>) {
        if (!tournaments[0]) return { modifiedCount: 0 };
        if (update.$set) Object.assign(tournaments[0], update.$set);
        if (update.$unset) {
          for (const key of Object.keys(update.$unset)) delete tournaments[0][key];
        }
        return { modifiedCount: 1 };
      },
    },
    teams: {
      find(filter: Record<string, unknown>) {
        return new FindCursor(teams.filter((doc) => matchesFilter(doc, filter)));
      },
      async updateOne(filter: Doc, update: Record<string, Doc>) {
        const doc = teams.find((team) => team._id === filter._id);
        if (doc && update.$set) Object.assign(doc, update.$set);
        return { modifiedCount: doc ? 1 : 0 };
      },
      async updateMany(filter: Record<string, unknown>, update: Record<string, Doc>) {
        let modifiedCount = 0;
        for (const doc of teams.filter((team) => matchesFilter(team, filter))) {
          if (update.$set) Object.assign(doc, update.$set);
          if (update.$unset) {
            for (const key of Object.keys(update.$unset)) delete doc[key];
          }
          modifiedCount++;
        }
        return { modifiedCount };
      },
    },
    matches: {
      find(filter: Record<string, unknown>) {
        return new FindCursor(matches.filter((doc) => matchesFilter(doc, filter)));
      },
      async countDocuments(filter: Record<string, unknown>) {
        return matches.filter((doc) => matchesFilter(doc, filter)).length;
      },
      async deleteMany(filter: Record<string, unknown>) {
        let deletedCount = 0;
        for (let i = matches.length - 1; i >= 0; i--) {
          if (matchesFilter(matches[i]!, filter)) {
            matches.splice(i, 1);
            deletedCount++;
          }
        }
        return { deletedCount };
      },
      async insertOne(doc: Doc) {
        const insertedId = new ObjectId();
        matches.push({ ...doc, _id: insertedId });
        return { insertedId };
      },
    },
  };

  return {
    db: {
      collection(name: keyof typeof collections) {
        return collections[name];
      },
    },
    state: { tournaments, teams, matches },
  };
}

describe('rebalanceTournamentTeams', () => {
  it('rejects rebalance after the tournament has started', async () => {
    const tournamentId = new ObjectId().toString();
    const teamId = new ObjectId();
    const { db, state } = makeDb({
      tournament: {
        _id: new ObjectId(tournamentId),
        tournamentId,
        phase: 'classification',
        startedAt: new Date().toISOString(),
        maxTeams: 4,
        groupCount: 2,
      },
      teams: [{ _id: teamId, tournamentId, createdAt: '1', groupIndex: 0 }],
      matches: [],
    });

    await expect(rebalanceTournamentTeams(db as never, tournamentId)).rejects.toThrow('Tournament already started');
    expect(state.teams[0]?.groupIndex).toBe(0);
  });

  it('rejects rebalance when inconsistent pre-start data already has a locked match', async () => {
    const tournamentId = new ObjectId().toString();
    const teamId = new ObjectId();
    const { db, state } = makeDb({
      tournament: {
        _id: new ObjectId(tournamentId),
        tournamentId,
        phase: 'registration',
        maxTeams: 4,
        groupCount: 2,
      },
      teams: [{ _id: teamId, tournamentId, createdAt: '1', groupIndex: 0 }],
      matches: [{ _id: new ObjectId(), tournamentId, stage: 'classification', status: 'completed' }],
    });

    await expect(rebalanceTournamentTeams(db as never, tournamentId)).rejects.toThrow('Tournament already started');
    expect(state.matches).toHaveLength(1);
    expect(state.teams[0]?.groupIndex).toBe(0);
  });

  it('regenerates scheduled classification matches after pre-start rebalance', async () => {
    const tournamentId = new ObjectId().toString();
    const teamIds = Array.from({ length: 4 }, () => new ObjectId());
    const { db, state } = makeDb({
      tournament: {
        _id: new ObjectId(tournamentId),
        tournamentId,
        phase: 'registration',
        maxTeams: 4,
        groupCount: 2,
        classificationMatchesPerOpponent: 1,
        pointsToWin: 21,
        setsPerMatch: 1,
      },
      teams: teamIds.map((id, i) => ({
        _id: id,
        tournamentId,
        createdAt: String(i),
        groupIndex: 0,
        category: 'Gold',
      })),
      matches: [
        {
          _id: new ObjectId(),
          tournamentId,
          stage: 'classification',
          status: 'scheduled',
          teamAId: teamIds[0]!.toString(),
          teamBId: teamIds[1]!.toString(),
          groupIndex: 0,
        },
      ],
    });

    const result = await rebalanceTournamentTeams(db as never, tournamentId);

    expect(result).toMatchObject({ updated: 2, teams: 4, matches: { created: 2, total: 2 } });
    expect(state.teams.map((team) => team.groupIndex)).toEqual([0, 1, 0, 1]);
    expect(state.teams.every((team) => !('category' in team))).toBe(true);
    const regenerated = state.matches.filter((match) => match.stage === 'classification');
    expect(regenerated).toHaveLength(2);
    expect(regenerated.map((match) => [match.teamAId, match.teamBId, match.groupIndex])).toEqual([
      [teamIds[0]!.toString(), teamIds[2]!.toString(), 0],
      [teamIds[1]!.toString(), teamIds[3]!.toString(), 1],
    ]);
  });
});
