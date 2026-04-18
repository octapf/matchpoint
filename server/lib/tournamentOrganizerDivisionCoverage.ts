import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { TournamentDivision } from '../../types';
import {
  missingDivisionForOrganizers,
  tournamentDivisionsNormalized,
} from '../../lib/tournamentOrganizerCoverage';

const COVERAGE_ERROR = 'Each division must have at least one organizer registered in that division';

export type OrganizerCoverageState = {
  divisions: unknown;
  organizerIds: string[];
  organizerOnlyIds: string[];
  organizerOnlyCovers: Record<string, TournamentDivision[]>;
};

function parseCoversFromDoc(
  raw: unknown,
  organizerOnlyIds: string[]
): Record<string, TournamentDivision[]> {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, TournamentDivision[]> = {};
  for (const uid of organizerOnlyIds) {
    const v = obj[uid];
    const arr = Array.isArray(v) ? v : [];
    out[uid] = [
      ...new Set(
        arr.filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed')
      ),
    ];
  }
  return out;
}

/**
 * Build merged organizer coverage state for validation (after organizer list / only-ids / covers changes).
 */
/**
 * After removing an organizer (or their entry), compute coverage state for validation / persistence.
 */
export function mergedCoverageAfterRemovingOrganizer(
  tournament: {
    divisions?: unknown;
    organizerOnlyIds?: unknown;
    organizerOnlyCovers?: unknown;
  },
  nextOrganizerIds: string[],
  removedUserId: string
): OrganizerCoverageState {
  const onlyRaw = Array.isArray(tournament.organizerOnlyIds)
    ? (tournament.organizerOnlyIds as string[])
    : [];
  const nextOnly = onlyRaw.filter((id) => nextOrganizerIds.includes(id) && id !== removedUserId);
  const prevCovers =
    tournament.organizerOnlyCovers &&
    typeof tournament.organizerOnlyCovers === 'object' &&
    !Array.isArray(tournament.organizerOnlyCovers)
      ? (tournament.organizerOnlyCovers as Record<string, unknown>)
      : {};
  const nextCovers: Record<string, TournamentDivision[]> = {};
  for (const uid of nextOnly) {
    const arr = prevCovers[uid];
    const list = Array.isArray(arr) ? arr : [];
    nextCovers[uid] = [
      ...new Set(
        list.filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed')
      ),
    ];
  }
  return {
    divisions: tournament.divisions,
    organizerIds: nextOrganizerIds,
    organizerOnlyIds: nextOnly,
    organizerOnlyCovers: nextCovers,
  };
}

export function buildOrganizerCoverageState(
  tournament: {
    divisions?: unknown;
    organizerIds?: unknown;
    organizerOnlyIds?: unknown;
    organizerOnlyCovers?: unknown;
  },
  nextOrganizerIds: string[],
  overrides?: Partial<Pick<OrganizerCoverageState, 'organizerOnlyIds' | 'organizerOnlyCovers'>>
): OrganizerCoverageState {
  const onlyFromDoc = Array.isArray(tournament.organizerOnlyIds)
    ? (tournament.organizerOnlyIds as string[]).filter((id) => nextOrganizerIds.includes(id))
    : [];
  const nextOnly =
    overrides?.organizerOnlyIds !== undefined
      ? overrides.organizerOnlyIds.filter((id) => nextOrganizerIds.includes(id))
      : onlyFromDoc;

  const coversFromDoc = parseCoversFromDoc(tournament.organizerOnlyCovers, nextOnly);
  let nextCovers: Record<string, TournamentDivision[]>;
  if (overrides?.organizerOnlyCovers !== undefined) {
    nextCovers = {};
    for (const uid of nextOnly) {
      const list = overrides.organizerOnlyCovers[uid];
      nextCovers[uid] = Array.isArray(list)
        ? [
            ...new Set(
              list.filter((x): x is TournamentDivision => x === 'men' || x === 'women' || x === 'mixed')
            ),
          ]
        : [];
    }
  } else {
    nextCovers = coversFromDoc;
  }

  return {
    divisions: tournament.divisions,
    organizerIds: nextOrganizerIds,
    organizerOnlyIds: nextOnly,
    organizerOnlyCovers: nextCovers,
  };
}

export async function assertOrganizersCoverAllDivisions(
  db: Db,
  tournamentId: string,
  merged: OrganizerCoverageState
): Promise<{ ok: true } | { ok: false; error: string }> {
  const divisions = tournamentDivisionsNormalized(merged.divisions);
  const entriesCol = db.collection('entries');
  const teamsCol = db.collection('teams');
  const usersCol = db.collection('users');
  const entriesForTournament = await entriesCol.find({ tournamentId }).toArray();
  const teamsForTournament = await teamsCol.find({ tournamentId }).toArray();
  const userIds = new Set<string>();
  for (const e of entriesForTournament) {
    if (e.userId && typeof e.userId === 'string') userIds.add(e.userId);
  }
  for (const t of teamsForTournament) {
    for (const pid of (t.playerIds as string[]) ?? []) {
      if (typeof pid === 'string' && ObjectId.isValid(pid)) userIds.add(pid);
    }
  }
  const validUserIds = [...userIds].filter((id) => ObjectId.isValid(id));
  const usersForTournament =
    validUserIds.length > 0
      ? await usersCol.find({ _id: { $in: validUserIds.map((id) => new ObjectId(id)) } }).toArray()
      : [];
  const userGender = new Map<string, string>();
  for (const u of usersForTournament) {
    userGender.set(u._id.toString(), typeof u.gender === 'string' ? u.gender : '');
  }
  const guestDocs = await db.collection('tournament_guest_players').find({ tournamentId }).toArray();
  const guestGenderById = new Map<string, string>();
  for (const g of guestDocs) {
    guestGenderById.set((g._id as ObjectId).toString(), typeof g.gender === 'string' ? g.gender : '');
  }
  const teamsById = new Map(
    teamsForTournament.map((t) => [t._id.toString(), { playerIds: (t.playerIds as string[]) ?? [] }])
  );
  const entriesSlim = entriesForTournament
    .filter((e) => e.userId && typeof e.userId === 'string')
    .map((e) => ({
      userId: e.userId as string,
      teamId: typeof e.teamId === 'string' ? e.teamId : e.teamId == null ? undefined : String(e.teamId),
    }));
  const missing = missingDivisionForOrganizers(
    divisions,
    merged.organizerIds,
    entriesSlim,
    teamsById,
    userGender,
    {
      organizerOnlyIds: merged.organizerOnlyIds,
      organizerOnlyCovers: merged.organizerOnlyCovers,
    },
    guestGenderById
  );
  if (missing) {
    return { ok: false, error: COVERAGE_ERROR };
  }
  return { ok: true };
}
