import type { Team } from '@/types';

export function isMongoObjectId(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && /^[a-f0-9]{24}$/i.test(raw.trim());
}

/** Label for a match side when the opponent is not yet assigned (knockout feeder). */
export function teamDisplayName(teamId: string | undefined, team: Team | undefined, tbdLabel: string): string {
  if (!isMongoObjectId(teamId)) return tbdLabel;
  return team?.name?.trim() ? team.name : tbdLabel;
}

/** Build a Team row for fixture lists when id may be empty until bracket advances. */
export function resolveTeamForFixture(
  rawId: string | undefined,
  teamById: Record<string, Team>,
  tournamentId: string,
  tbdLabel: string
): Team {
  const id = String(rawId ?? '').trim();
  if (isMongoObjectId(id)) {
    const t = teamById[id];
    if (t) return t;
    return {
      _id: id,
      name: tbdLabel,
      tournamentId,
      playerIds: [],
      createdBy: '',
      createdAt: '',
      updatedAt: '',
    };
  }
  return {
    _id: id || 'pending',
    name: tbdLabel,
    tournamentId,
    playerIds: [],
    createdBy: '',
    createdAt: '',
    updatedAt: '',
  };
}
