import type { Entry, Team, TournamentDivision, TournamentGuestPlayer, User } from '@/types';
import { guestPlayerIdFromSlot, isGuestPlayerSlot } from '@/lib/playerSlots';

export type DivisionTab = TournamentDivision;

export function divisionForPair(g1?: string, g2?: string): DivisionTab {
  if (g1 === 'male' && g2 === 'male') return 'men';
  if (g1 === 'female' && g2 === 'female') return 'women';
  // Mixed for any combination / unknown.
  return 'mixed';
}

function genderForSlot(
  slotId: string | undefined,
  userMap: Record<string, User>,
  guestMap?: Record<string, TournamentGuestPlayer | undefined>
): string | undefined {
  if (!slotId) return undefined;
  if (isGuestPlayerSlot(slotId)) {
    const gid = guestPlayerIdFromSlot(slotId);
    return gid ? guestMap?.[gid]?.gender : undefined;
  }
  return userMap[slotId]?.gender;
}

export function divisionForTeam(
  team: Team,
  userMap: Record<string, User>,
  guestMap?: Record<string, TournamentGuestPlayer | undefined>
): DivisionTab {
  const g1 = genderForSlot(team.playerIds?.[0], userMap, guestMap);
  const g2 = genderForSlot(team.playerIds?.[1], userMap, guestMap);
  return divisionForPair(g1, g2);
}

export function divisionForEntry(
  entry: Entry,
  userMap: Record<string, User>,
  teamDivisionById: Record<string, DivisionTab>,
  guestMap?: Record<string, TournamentGuestPlayer | undefined>
): DivisionTab | null {
  if (entry.teamId && teamDivisionById[entry.teamId]) return teamDivisionById[entry.teamId]!;
  const uid = entry.userId;
  if (uid) {
    const g = userMap[uid]?.gender;
    if (g === 'male') return 'men';
    if (g === 'female') return 'women';
    return null;
  }
  const gid = entry.guestPlayerId;
  if (gid && guestMap?.[gid]) {
    const g = guestMap[gid]!.gender;
    if (g === 'male') return 'men';
    if (g === 'female') return 'women';
  }
  return null;
}
