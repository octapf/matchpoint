/** Same rules as server `server/lib/usernameRules.ts`. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(s: string): boolean {
  return USERNAME_REGEX.test(s);
}
