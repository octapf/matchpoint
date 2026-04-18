/** Stored on `teams.playerIds` to distinguish guest roster rows from real `users._id` strings. */
export const GUEST_PLAYER_PREFIX = 'guest:' as const;

const HEX24 = /^[a-f0-9]{24}$/i;

export function isGuestPlayerSlot(id: string): boolean {
  if (typeof id !== 'string' || !id.startsWith(GUEST_PLAYER_PREFIX)) return false;
  return HEX24.test(id.slice(GUEST_PLAYER_PREFIX.length));
}

export function guestPlayerIdFromSlot(slot: string): string | null {
  if (!isGuestPlayerSlot(slot)) return null;
  return slot.slice(GUEST_PLAYER_PREFIX.length).toLowerCase();
}

export function toGuestPlayerSlot(guestDocumentId: string): string {
  const s = String(guestDocumentId ?? '').trim().toLowerCase();
  if (!HEX24.test(s)) throw new Error('Invalid guest id');
  return `${GUEST_PLAYER_PREFIX}${s}`;
}

export function parsePlayerSlot(slot: string): { kind: 'user'; userId: string } | { kind: 'guest'; guestId: string } | null {
  const s = String(slot ?? '').trim();
  if (!s) return null;
  if (isGuestPlayerSlot(s)) {
    const gid = guestPlayerIdFromSlot(s);
    return gid ? { kind: 'guest', guestId: gid } : null;
  }
  if (HEX24.test(s)) return { kind: 'user', userId: s.toLowerCase() };
  return null;
}

/** Normalize two roster slots: distinct, each user id or guest:ObjectId hex */
export function normalizeTeamPlayerSlots(raw: unknown): [string, string] | null {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const clean = list
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i);
  if (clean.length !== 2) return null;
  const a = parsePlayerSlot(clean[0]!);
  const b = parsePlayerSlot(clean[1]!);
  if (!a || !b) return null;
  const sa = a.kind === 'user' ? a.userId : toGuestPlayerSlot(a.guestId);
  const sb = b.kind === 'user' ? b.userId : toGuestPlayerSlot(b.guestId);
  if (sa === sb) return null;
  return [sa, sb];
}
