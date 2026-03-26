/** Same rules as email signup and OAuth-derived usernames: 3–24 chars, [a-zA-Z0-9_], stored lowercase. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(s: string): boolean {
  return USERNAME_REGEX.test(s);
}
