import type { TournamentGuestPlayer, User } from '@/types';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { isGuestPlayerSlot, guestPlayerIdFromSlot } from '@/lib/playerSlots';

export function tournamentGuestDisplayName(g: TournamentGuestPlayer | undefined | null): string {
  const n = (g?.displayName ?? '').trim();
  return n || 'Guest';
}

/** Resolve a roster slot (`userId` or `guest:<id>`) to a short display label. */
export function resolveRosterSlotLabel(
  slotId: string,
  userMap: Record<string, User | undefined>,
  guestMap: Record<string, TournamentGuestPlayer | undefined>,
): string {
  if (!slotId) return '';
  if (isGuestPlayerSlot(slotId)) {
    const gid = guestPlayerIdFromSlot(slotId);
    return gid ? tournamentGuestDisplayName(guestMap[gid]) : slotId;
  }
  const u = userMap[slotId];
  return u ? getTournamentPlayerDisplayName(u) : slotId;
}
