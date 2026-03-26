import type { User } from '@/types';

function fullNameFromParts(first?: string, last?: string): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

/** Public handle: `username` (legacy `displayName` on old documents only). */
export function getUserDisplayName(user: User | null | undefined, fallback = 'Player'): string {
  if (!user) return fallback;
  const handle = user.username?.trim();
  if (handle) return handle;
  const legacy = user.displayName?.trim();
  if (legacy) return legacy;
  const fromParts = fullNameFromParts(user.firstName, user.lastName);
  return fromParts || fallback;
}

/**
 * Tournament player/team lists: prefer `username`; else given name + first letter of surname (e.g. "María G.").
 */
export function getPlayerListName(user: User | null | undefined, fallback = 'Player'): string {
  if (!user) return fallback;
  const handle = user.username?.trim();
  if (handle) return handle;
  const legacy = user.displayName?.trim();
  if (legacy) return legacy;

  const first = user.firstName?.trim() || '';
  const last = user.lastName?.trim() || '';
  if (first && last) {
    const ch = last.charAt(0);
    if (ch) return `${first} ${ch.toUpperCase()}.`;
  }
  if (first) return first;
  return fallback;
}

/** Sort key: username, else legacy displayName, else last + first. */
export function getPlayerSortKey(user: User | null | undefined): string {
  if (!user) return '';
  const u = user.username?.trim();
  if (u) return u.toLowerCase();
  const dn = user.displayName?.trim();
  if (dn) return dn.toLowerCase();
  const ln = user.lastName?.trim() || '';
  const fn = user.firstName?.trim() || '';
  if (ln || fn) return `${ln} ${fn}`.trim().toLowerCase();
  return '';
}
