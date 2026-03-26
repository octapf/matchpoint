import type { Collection } from 'mongodb';

const USERNAME_MIN = 3;
const USERNAME_MAX = 24;

/**
 * Derives a handle from the email local part: [a-z0-9_], 3–24 chars (same shape as email signup usernames).
 */
export function baseUsernameFromEmail(email: string): string {
  const at = email.indexOf('@');
  const local = (at > 0 ? email.slice(0, at) : email).toLowerCase();
  let s = local.replace(/[^a-z0-9_]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (s.length === 0) s = 'user';
  if (s.length < USERNAME_MIN) {
    s = (s + 'xxx').slice(0, USERNAME_MIN);
  }
  if (s.length > USERNAME_MAX) s = s.slice(0, USERNAME_MAX);
  return s;
}

/**
 * Reserves a username not present in `users` (compares lowercase).
 */
export async function allocateUniqueUsernameFromEmail(col: Collection, email: string): Promise<string> {
  const base = baseUsernameFromEmail(email);
  let n = 0;
  while (n < 10000) {
    let candidate: string;
    if (n === 0) {
      candidate = base.slice(0, USERNAME_MAX);
    } else {
      const suffix = String(n + 1);
      const maxBase = USERNAME_MAX - suffix.length;
      candidate = (base.slice(0, Math.max(0, maxBase)) + suffix).slice(0, USERNAME_MAX).toLowerCase();
      if (candidate.length < USERNAME_MIN) {
        candidate = (candidate + 'xxx').slice(0, USERNAME_MIN);
      }
    }
    const exists = await col.findOne({ username: candidate });
    if (!exists) return candidate;
    n++;
  }
  throw new Error('Could not allocate username');
}
