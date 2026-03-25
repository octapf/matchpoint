import type { User } from '@/types';

/** Strips accessToken from API auth responses before storing User. */
export function parseAuthPayload(raw: Record<string, unknown>): { user: User; accessToken: string } {
  const accessToken = raw.accessToken;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Missing accessToken in auth response');
  }
  const { accessToken: _drop, ...rest } = raw;
  return { user: rest as unknown as User, accessToken };
}
