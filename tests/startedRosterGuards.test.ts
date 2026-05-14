import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actorId: '507f1f77bcf86cd799439011',
  tournamentId: '507f1f77bcf86cd799439012',
  teamId: '507f1f77bcf86cd799439013',
  guestId: '507f1f77bcf86cd799439014',
  getDb: vi.fn(),
  insertTeamWithEntriesTx: vi.fn(),
  deleteGuestPlayer: vi.fn(),
}));

vi.mock('../server/lib/mongodb', () => ({
  getDb: mocks.getDb,
  getMongoClient: vi.fn(),
}));

vi.mock('../server/lib/cors', () => ({
  MATCHPOINT_API_VERSION: '1',
  withCors: (_req: VercelRequest, res: VercelResponse) => res,
}));

vi.mock('../server/lib/auth', () => ({
  getSessionUserId: vi.fn(() => mocks.actorId),
  isUserAdmin: vi.fn(() => false),
  loadActorUserWithAdminRefresh: vi.fn(() => ({ _id: mocks.actorId, role: 'user' })),
  resolveActorUserId: vi.fn(() => mocks.actorId),
}));

vi.mock('../server/lib/organizer', () => ({
  isTournamentOrganizer: vi.fn(() => true),
}));

vi.mock('../server/lib/insertTeamWithEntriesTx', () => ({
  insertTeamWithEntriesTx: mocks.insertTeamWithEntriesTx,
}));

vi.mock('../server/lib/tournamentGuestPlayerActions', () => ({
  createGuestPlayer: vi.fn(),
  updateGuestPlayer: vi.fn(),
  deleteGuestPlayer: mocks.deleteGuestPlayer,
  deleteAllGuestPlayers: vi.fn(),
}));

import teamsHandler from '../api/teams';
import teamByIdHandler from '../api/teams/[id]';
import tournamentByIdHandler from '../api/tournaments/[id]';

type MockResponse = VercelResponse & { statusCode: number; body: unknown };

function response(): MockResponse {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(function status(this: MockResponse, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function json(this: MockResponse, body: unknown) {
      this.body = body;
      return this;
    }),
    end: vi.fn(function end(this: MockResponse) {
      return this;
    }),
  };
  return res as MockResponse;
}

function startedTournament() {
  return {
    _id: new ObjectId(mocks.tournamentId),
    organizerIds: [mocks.actorId],
    startedAt: '2026-05-14T10:00:00.000Z',
    phase: 'classification',
  };
}

describe('started tournament roster guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects team creation after the tournament has started', async () => {
    const teams = {};
    const tournaments = { findOne: vi.fn(async () => startedTournament()) };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'teams') return teams;
        if (name === 'tournaments') return tournaments;
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const req = {
      method: 'POST',
      body: {
        tournamentId: mocks.tournamentId,
        name: 'Late team',
        playerIds: [mocks.actorId, new ObjectId().toString()],
        createdBy: mocks.actorId,
      },
    } as unknown as VercelRequest;
    const res = response();

    await teamsHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Tournament already started' });
    expect(mocks.insertTeamWithEntriesTx).not.toHaveBeenCalled();
  });

  it('rejects group changes after the tournament has started', async () => {
    const teams = {
      findOne: vi.fn(async () => ({
        _id: new ObjectId(mocks.teamId),
        tournamentId: mocks.tournamentId,
        playerIds: [mocks.actorId, new ObjectId().toString()],
      })),
      findOneAndUpdate: vi.fn(),
    };
    const tournaments = { findOne: vi.fn(async () => startedTournament()) };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'teams') return teams;
        if (name === 'tournaments') return tournaments;
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const req = {
      method: 'PATCH',
      query: { id: mocks.teamId },
      body: { groupIndex: 1 },
    } as unknown as VercelRequest;
    const res = response();

    await teamByIdHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Team group cannot be changed after the tournament has started' });
    expect(teams.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects single guest deletion after the tournament has started', async () => {
    const tournaments = { findOne: vi.fn(async () => startedTournament()) };
    mocks.getDb.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'tournaments') return tournaments;
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const req = {
      method: 'POST',
      query: { id: mocks.tournamentId },
      body: { action: 'deleteGuestPlayer', guestId: mocks.guestId },
    } as unknown as VercelRequest;
    const res = response();

    await tournamentByIdHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Tournament already started' });
    expect(mocks.deleteGuestPlayer).not.toHaveBeenCalled();
  });
});
