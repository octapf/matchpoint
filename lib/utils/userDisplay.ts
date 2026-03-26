import type { User } from '@/types';

function fullNameFromParts(first?: string, last?: string): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

/** Prefer explicit displayName; otherwise first + last name (not firstName alone). */
export function getUserDisplayName(user: User | null | undefined, fallback = 'Player'): string {
  if (!user) return fallback;
  const custom = user.displayName?.trim();
  if (custom) return custom;
  const fromParts = fullNameFromParts(user.firstName, user.lastName);
  return fromParts || fallback;
}
