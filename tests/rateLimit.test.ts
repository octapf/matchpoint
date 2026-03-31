import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../server/lib/rateLimit';
import type { VercelRequest } from '@vercel/node';

function mockReq(headers: Record<string, string>): VercelRequest {
  return { headers } as unknown as VercelRequest;
}

describe('checkRateLimit', () => {
  it('allows under cap', () => {
    const req = mockReq({ 'x-forwarded-for': '10.0.0.1' });
    expect(checkRateLimit(req, 't', 5, 60_000).ok).toBe(true);
  });
});
