import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import teamsHandler from '../api/teams/[id]';
import tournamentHandler from '../api/tournaments/[id]';

const mocked = vi.hoisted(() => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
  withCors: vi.fn(),
  resolveActorUserId: vi.fn(),
  getSessionUserId: vi.fn(),
  loadActorUserWithAdminRefresh: vi.fn(),
  isUserAdmin: vi.fn(),
  isTournamentOrganizer: vi.fn(),
  createGuestPlayer: vi.fn(),
  updateGuestPlayer: vi.fn(),
  deleteGuestPlayer: vi.fn(),
  deleteAllGuestPlayers: vi.fn(),
}));

vi.mock('../server/lib/mongodb', () => ({
  getDb: mocked.getDb,
  getMongoClient: mocked.getMongoClient,
}));

vi.mock('../server/lib/cors', () => ({
  withCors: mocked.withCors,
}));

vi.mock('../server/lib/auth', () => ({
  resolveActorUserId: mocked.resolveActorUserId,
  getSessionUserId: mocked.getSessionUserId,
  loadActorUserWithAdminRefresh: mocked.loadActorUserWithAdminRefresh,
  isUserAdmin: mocked.isUserAdmin,
}));

vi.mock('../server/lib/organizer', () => ({
  isTournamentOrganizer: mocked.isTournamentOrganizer,
}));

vi.mock('../server/lib/tournamentGuestPlayerActions', () => ({
  createGuestPlayer: mocked.createGuestPlayer,
  updateGuestPlayer: mocked.updateGuestPlayer,
  deleteGuestPlayer: mocked.deleteGuestPlayer,
  deleteAllGuestPlayers: mocked.deleteAllGuestPlayers,
}));

function mockResponse() {
  const res: any = {
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
  };
  return res;
}

function mockDb(collections: Record<string, unknown>) {
  return {
    collection: vi.fn((name: string) => {
      const collection = collections[name];
      if (!collection) throw new Error(`Unexpected collection ${name}`);
      return collection;
    }),
  };
}

describe('live tournament mutation guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.withCors.mockImplementation((_req, res) => res);
    mocked.loadActorUserWithAdminRefresh.mockResolvedValue({ _id: new ObjectId(), role: 'user' });
    mocked.isUserAdmin.mockReturnValue(false);
    mocked.isTournamentOrganizer.mockReturnValue(true);
  });

  it('rejects team group changes after tournament start', async () => {
    const actorId = new ObjectId().toString();
    const teamId = new ObjectId();
    const tournamentId = new ObjectId();
    const teamsCol = {
      findOne: vi.fn(async () => ({
        _id: teamId,
        tournamentId: tournamentId.toString(),
        playerIds: [],
        groupIndex: 0,
      })),
      updateOne: vi.fn(),
    };
    const tournamentsCol = {
      findOne: vi.fn(async () => ({
        _id: tournamentId,
        organizerIds: [actorId],
        startedAt: '2026-05-16T10:00:00.000Z',
        phase: 'classification',
        groupsDistributedAt: '2026-05-16T09:00:00.000Z',
      })),
    };
    mocked.getDb.mockResolvedValue(mockDb({ teams: teamsCol, tournaments: tournamentsCol }));
    mocked.resolveActorUserId.mockReturnValue(actorId);

    const res = mockResponse();
    await teamsHandler(
      {
        method: 'PATCH',
        query: { id: teamId.toString() },
        body: { groupIndex: 1 },
      } as any,
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Team group cannot be changed after the tournament has started' });
    expect(teamsCol.updateOne).not.toHaveBeenCalled();
  });

  it('rejects single guest deletion after tournament start', async () => {
    const actorId = new ObjectId().toString();
    const tournamentId = new ObjectId();
    const guestId = new ObjectId().toString();
    const tournamentsCol = {
      findOne: vi.fn(async () => ({
        _id: tournamentId,
        organizerIds: [actorId],
        startedAt: '2026-05-16T10:00:00.000Z',
        phase: 'classification',
      })),
    };
    mocked.getDb.mockResolvedValue(mockDb({ tournaments: tournamentsCol }));
    mocked.resolveActorUserId.mockReturnValue(actorId);
    mocked.deleteGuestPlayer.mockResolvedValue({ ok: true });

    const res = mockResponse();
    await tournamentHandler(
      {
        method: 'POST',
        query: { id: tournamentId.toString() },
        body: { action: 'deleteGuestPlayer', guestId },
      } as any,
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Tournament already started' });
    expect(mocked.deleteGuestPlayer).not.toHaveBeenCalled();
  });
});
