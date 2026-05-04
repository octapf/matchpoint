import { describe, expect, it } from 'vitest';
import {
  buildDefaultServeOrder,
  serveSideAtIndex,
  validateServeOrderForTeams,
} from '../server/lib/serveOrder';

describe('serve order validation', () => {
  it('builds a four-slot default by duplicating singles', () => {
    expect(buildDefaultServeOrder(['a1'], ['b1'])).toEqual(['a1', 'b1', 'a1', 'b1']);
  });

  it('accepts either team as the odd serve slots', () => {
    expect(validateServeOrderForTeams(['a1', 'b1', 'a2', 'b2'], ['a1', 'a2'], ['b1', 'b2'])).toMatchObject({
      ok: true,
      startsSide: 'A',
    });
    expect(validateServeOrderForTeams(['b2', 'a2', 'b1', 'a1'], ['a1', 'a2'], ['b1', 'b2'])).toMatchObject({
      ok: true,
      startsSide: 'B',
    });
  });

  it('rejects players outside the two match rosters', () => {
    expect(validateServeOrderForTeams(['a1', 'b1', 'intruder', 'b2'], ['a1', 'a2'], ['b1', 'b2'])).toEqual({
      ok: false,
      error: 'Serve order contains invalid players',
    });
  });

  it('rejects orders that mix both teams on the same serve side', () => {
    expect(validateServeOrderForTeams(['a1', 'b1', 'b2', 'a2'], ['a1', 'a2'], ['b1', 'b2'])).toEqual({
      ok: false,
      error: 'Serve order contains invalid players',
    });
  });

  it('derives the serving side from the configured starter', () => {
    expect(serveSideAtIndex(['b1', 'a1', 'b2', 'a2'], ['a1', 'a2'], ['b1', 'b2'], 0)).toBe('B');
    expect(serveSideAtIndex(['b1', 'a1', 'b2', 'a2'], ['a1', 'a2'], ['b1', 'b2'], 1)).toBe('A');
    expect(serveSideAtIndex(['a1', 'b1', 'a1', 'b1'], ['a1'], ['b1'], 2)).toBe('A');
  });
});
