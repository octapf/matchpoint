import type { User } from '@/types';

/** Display name logic: displayName || firstName || fallback */
export function getUserDisplayName(user: User | null | undefined, fallback = 'Player'): string {
  if (!user) return fallback;
  return user.displayName?.trim() || user.firstName?.trim() || fallback;
}
