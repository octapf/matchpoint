import type { TournamentDivision } from '../types';
import { guestPlayerIdFromSlot, isGuestPlayerSlot } from './playerSlots';

export type EntryDivisionInput = { userId: string; teamId?: string | null };

/**
 * Enabled divisions for the tournament (defaults to mixed).
 */
export function tournamentDivisionsNormalized(raw: unknown): TournamentDivision[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ['mixed'];
  }
  const out = raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed');
  const uniq = [...new Set(out)];
  return uniq.length > 0 ? uniq : ['mixed'];
}

/**
 * Which division this entry competes in (aligned with `divisionForEntry` / team pairing rules).
 * Solo players without male/female gender count as `mixed` when mixed is enabled.
 */
function genderForRosterSlot(
  pid: string | undefined,
  userGender: Map<string, string>,
  guestGenderById?: Map<string, string>
): string {
  if (!pid) return '';
  if (isGuestPlayerSlot(pid)) {
    const gid = guestPlayerIdFromSlot(pid);
    return gid && guestGenderById ? guestGenderById.get(gid) ?? '' : '';
  }
  return userGender.get(pid) ?? '';
}

export function divisionForOrganizerCoverage(
  entry: EntryDivisionInput,
  teamsById: Map<string, { playerIds?: string[] }>,
  userGender: Map<string, string>,
  divisionsEnabled: TournamentDivision[],
  guestGenderById?: Map<string, string>
): TournamentDivision | null {
  const tid = entry.teamId?.trim();
  if (tid) {
    const team = teamsById.get(tid);
    const pids = team?.playerIds ?? [];
    const g1 = genderForRosterSlot(pids[0], userGender, guestGenderById);
    const g2 = genderForRosterSlot(pids[1], userGender, guestGenderById);
    if (g1 === 'male' && g2 === 'male') return 'men';
    if (g1 === 'female' && g2 === 'female') return 'women';
    return 'mixed';
  }
  const g = userGender.get(entry.userId) ?? '';
  if (g === 'male') return 'men';
  if (g === 'female') return 'women';
  if (divisionsEnabled.includes('mixed')) return 'mixed';
  return null;
}

/** Normalize covers map for client-side coverage checks. */
export function organizerOnlyCoversFromTournament(
  raw: Partial<Record<string, TournamentDivision[]>> | undefined,
  organizerOnlyIds: string[]
): Record<string, TournamentDivision[]> {
  const out: Record<string, TournamentDivision[]> = {};
  for (const uid of organizerOnlyIds) {
    const v = raw?.[uid];
    out[uid] = Array.isArray(v) ? v : [];
  }
  return out;
}

export type OrganizerCoverageExtras = {
  /** Subset of `organizerIds` who do not play; their entries are ignored for playing coverage. */
  organizerOnlyIds?: string[];
  /** Divisions each organize-only organizer covers (keys should be organize-only user ids). */
  organizerOnlyCovers?: Partial<Record<string, TournamentDivision[]>>;
};

/**
 * Returns a division that has no organizer covering it, or `null` if every enabled division is covered.
 * Playing organizers (not in `organizerOnlyIds`) cover via roster/entry; organize-only cover via `organizerOnlyCovers`.
 */
export function missingDivisionForOrganizers(
  divisions: TournamentDivision[],
  organizerIds: string[],
  entries: EntryDivisionInput[],
  teamsById: Map<string, { playerIds?: string[] }>,
  userGender: Map<string, string>,
  extras?: OrganizerCoverageExtras,
  guestGenderById?: Map<string, string>
): TournamentDivision | null {
  const divs = [...new Set(divisions)].filter((d) => d === 'men' || d === 'women' || d === 'mixed');
  if (divs.length === 0) return null;
  const onlySet = new Set(extras?.organizerOnlyIds ?? []);
  const onlyCovers = extras?.organizerOnlyCovers ?? {};
  const covered = new Set<TournamentDivision>();

  for (const oid of organizerIds) {
    if (onlySet.has(oid)) {
      const list = onlyCovers[oid];
      if (!Array.isArray(list)) continue;
      for (const d of list) {
        if (d === 'men' || d === 'women' || d === 'mixed') covered.add(d);
      }
      continue;
    }
    const entry = entries.find((e) => e.userId === oid);
    if (!entry) continue;
    const d = divisionForOrganizerCoverage(entry, teamsById, userGender, divs, guestGenderById);
    if (d) covered.add(d);
  }
  for (const need of divs) {
    if (!covered.has(need)) return need;
  }
  return null;
}
