import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  resolveActorUserId: vi.fn(),
  loadActorUserWithAdminRefresh: vi.fn(),
  isUserAdmin: vi.fn(),
  isTournamentOrganizer: vi.fn(),
  countTeamsInGroup: vi.fn(),
}));

vi.mock('../server/lib/mongodb', () => ({
  getDb: mocks.getDb,
  getMongoClient: mocks.getMongoClient,
}));

vi.mock('../server/lib/cors', () => ({
  withCors: (_req: unknown, res: unknown) => res,
}));

vi.mock('../server/lib/auth', () => ({
  resolveActorUserId: mocks.resolveActorUserId,
  loadActorUserWithAdminRefresh: mocks.loadActorUserWithAdminRefresh,
  isUserAdmin: mocks.isUserAdmin,
}));

vi.mock('../server/lib/organizer', () => ({
  isTournamentOrganizer: mocks.isTournamentOrganizer,
}));

vi.mock('../server/lib/tournamentGroupDb', () => ({
  countTeamsInGroup: mocks.countTeamsInGroup,
}));

import teamHandler from '../api/teams/[id]';
import { rebalanceTournamentTeams } from '../server/lib/rebalanceTournamentTeams';
import { deleteGuestPlayer } from '../server/lib/tournamentGuestPlayerActions';

const tournamentId = '507f1f77bcf86cd799439011';
const teamId = '507f1f77bcf86cd799439012';
const actorId = '507f1f77bcf86cd799439013';
const otherPlayerId = '507f1f77bcf86cd799439014';
const guestId = '507f1f77bcf86cd799439015';

function makeDb(collections: Record<string, unknown>): Db {
  return {
    collection: vi.fn((name: string) => collections[name]),
  } as unknown as Db;
}

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  } = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    end: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  };
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveActorUserId.mockReturnValue(actorId);
  mocks.loadActorUserWithAdminRefresh.mockResolvedValue({ _id: new ObjectId(actorId), role: 'admin' });
  mocks.isUserAdmin.mockReturnValue(true);
  mocks.isTournamentOrganizer.mockReturnValue(true);
  mocks.countTeamsInGroup.mockResolvedValue(0);
});

describe('started tournament mutation locks', () => {
  it('rejects direct team group moves after the tournament has started', async () => {
    const findOneAndUpdate = vi.fn();
    const db = makeDb({
      teams: {
        findOne: vi.fn().mockResolvedValue({
          _id: new ObjectId(teamId),
          tournamentId,
          playerIds: [actorId, otherPlayerId],
          groupIndex: 0,
        }),
        findOneAndUpdate,
      },
      tournaments: {
        findOne: vi.fn().mockResolvedValue({
          _id: new ObjectId(tournamentId),
          organizerIds: [actorId],
          phase: 'classification',
          groupsDistributedAt: new Date().toISOString(),
          maxTeams: 4,
          groupCount: 2,
        }),
      },
    });
    mocks.getDb.mockResolvedValue(db);

    const req = {
      method: 'PATCH',
      query: { id: teamId },
      body: { groupIndex: 1 },
    };
    const res = makeRes();

    await teamHandler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Team group cannot be changed after the tournament has started' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.countTeamsInGroup).not.toHaveBeenCalled();
  });

  it('rejects rebalanceGroups once tournament phase has started', async () => {
    const teamUpdate = vi.fn();
    const db = makeDb({
      tournaments: {
        findOne: vi.fn().mockResolvedValue({
          _id: new ObjectId(tournamentId),
          phase: 'classification',
          maxTeams: 4,
          groupCount: 2,
        }),
      },
      teams: { updateOne: teamUpdate },
      matches: { countDocuments: vi.fn().mockResolvedValue(0) },
    });

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament has started');
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('rejects rebalanceGroups when any match has already started', async () => {
    const teamUpdate = vi.fn();
    const db = makeDb({
      tournaments: {
        findOne: vi.fn().mockResolvedValue({
          _id: new ObjectId(tournamentId),
          phase: 'registration',
          maxTeams: 4,
          groupCount: 2,
        }),
      },
      matches: { countDocuments: vi.fn().mockResolvedValue(1) },
      teams: { updateOne: teamUpdate },
    });

    await expect(rebalanceTournamentTeams(db, tournamentId)).rejects.toThrow('Tournament has started');
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it('rejects guest deletion after start before dissolving teams', async () => {
    const deleteOne = vi.fn();
    const db = makeDb({
      tournaments: {
        findOne: vi.fn().mockResolvedValue({
          _id: new ObjectId(tournamentId),
          startedAt: new Date().toISOString(),
        }),
      },
      tournament_guest_players: { deleteOne },
      teams: { deleteOne: vi.fn() },
      entries: { updateMany: vi.fn(), deleteMany: vi.fn() },
    });

    await expect(deleteGuestPlayer(db, tournamentId, guestId)).resolves.toEqual({
      ok: false,
      error: 'Tournament already started',
    });
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
