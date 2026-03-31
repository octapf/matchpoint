import { describe, expect, it } from 'vitest';
import { adminPostSchema } from '../server/lib/schemas/adminPost';
import { teamsPostSchema } from '../server/lib/schemas/teamsPost';
import { tournamentPostActionSchema } from '../server/lib/schemas/tournamentPostAction';
import { MATCHPOINT_API_VERSION } from '../server/lib/cors';

describe('adminPostSchema', () => {
  it('accepts devSeed', () => {
    const r = adminPostSchema.safeParse({ action: 'devSeed', force: true });
    expect(r.success).toBe(true);
  });
  it('rejects unknown action', () => {
    const r = adminPostSchema.safeParse({ action: 'nope' });
    expect(r.success).toBe(false);
  });
});

describe('teamsPostSchema', () => {
  it('requires two player ids', () => {
    const r = teamsPostSchema.safeParse({
      tournamentId: '507f1f77bcf86cd799439011',
      name: 'A',
      playerIds: ['507f1f77bcf86cd799439011'],
      createdBy: '507f1f77bcf86cd799439011',
    });
    expect(r.success).toBe(false);
  });
});

describe('tournamentPostActionSchema', () => {
  it('allows extra fields', () => {
    const r = tournamentPostActionSchema.safeParse({
      action: 'updateMatch',
      matchId: '507f1f77bcf86cd799439011',
      pointsA: 21,
    });
    expect(r.success).toBe(true);
  });
});

describe('API version', () => {
  it('is pinned', () => {
    expect(MATCHPOINT_API_VERSION).toBe('1');
  });
});
