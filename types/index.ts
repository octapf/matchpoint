/**
 * Matchpoint data types
 */

export type Gender = 'male' | 'female';

export type UserRole = 'user' | 'admin';

export interface User {
  _id: string;
  /** Omitted in peer/public API responses (GET /api/users batch for other players). */
  email?: string;
  username?: string;
  firstName: string;
  lastName: string;
  /** User-selected accent theme preset (server persisted). */
  themePresetId?:
    | 'classic'
    | 'sport_blue'
    | 'sport_orange'
    | 'neon_pop'
    | 'lavender_mist'
    | 'blush_ice'
    | 'candy_pink'
    | 'forest_lime'
    | 'sand_rose'
    | 'pearl_frost'
    | 'amber_lagoon';
  /** @deprecated Legacy field; prefer `username`. Cleared when username is updated. */
  displayName?: string;
  phone?: string;
  /** When true, other authenticated users may see `phone` on your public profile. */
  phoneVisible?: boolean;
  gender?: Gender;
  /** Profile photo URL (e.g. from Google sign-in; hosted by Google, not stored by us). */
  photoUrl?: string;
  authProvider: 'google' | 'apple' | 'email';
  /** Set server-side or via ADMIN_EMAILS bootstrap */
  role?: UserRole;
  createdAt: string;
  updatedAt: string;
  /** Client-only: when the session expires (ms since epoch) */
  sessionExpiresAt?: number;
}

export type TournamentStatus = 'open' | 'full' | 'cancelled';

export type TournamentDivision = 'men' | 'women' | 'mixed';

export type TournamentPhase = 'registration' | 'classification' | 'categories' | 'completed';

export type TournamentCategory = 'Gold' | 'Silver' | 'Bronze';

export type TournamentBetKind = 'winner' | 'score';

export interface TournamentBettingMatchRow {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  winnerPctA: number | null;
  winnerPctB: number | null;
  winnerCountA: number;
  winnerCountB: number;
  lines: Array<{
    userId: string;
    kind: TournamentBetKind;
    pickWinnerTeamId?: string;
    pickPointsA?: number;
    pickPointsB?: number;
    pointsAwarded?: number;
    status?: string;
  }> | null;
}

export interface TournamentBettingSnapshot {
  bettingEnabled: boolean;
  bettingAllowWinner: boolean;
  bettingAllowScore: boolean;
  bettingAnonymous: boolean;
  /** Settled points / exact score hits; `picksCount` = all placed picks (pending + settled) so the tab is not empty before matches finish. */
  leaderboard: { userId: string; points: number; exactHits: number; picksCount: number }[];
  matches: TournamentBettingMatchRow[];
}

export interface Tournament {
  _id: string;
  name: string;
  /** @deprecated Use startDate. Kept for backward compat. */
  date?: string;
  startDate: string;
  endDate: string;
  /**
   * Per-division date ranges (registration + play window). When present, each enabled division should have a range.
   * Older tournaments may omit this; server may backfill using startDate/endDate.
   */
  divisionDates?: Partial<
    Record<
      TournamentDivision,
      {
        startDate: string;
        endDate: string;
      }
    >
  >;
  location: string;
  /** Optional hero image for list/detail cards; omit to use the default beach artwork. */
  coverImageUrl?: string;
  description?: string;
  /** Enabled divisions for registration/competition. Must include at least one. */
  divisions?: TournamentDivision[];
  /**
   * Optional sub-categories inside a division (e.g. Gold/Silver).
   * Empty/omitted means a single unnamed category.
   */
  categories?: string[];
  maxTeams: number;
  /** Points required to win a set (default 21). */
  pointsToWin?: number;
  /** Number of sets played per match (default 1). */
  setsPerMatch?: number;
  /** Number of groups (min 2, default 4). maxTeams ÷ groupCount must be ≥ 2 (default capacity 4 per group with 16 max teams). */
  groupCount?: number;
  /**
   * ISO timestamp when organizer ran "distribute into groups" (randomize). `null` = not yet distributed.
   * Omitted on older tournaments (treated as already distributed for backward compatibility).
   */
  groupsDistributedAt?: string | null;
  inviteLink: string;
  /** `public` = listed in app browse/feed for everyone. `private` = discoverable only via invite link (organizers still see theirs in lists). */
  visibility?: 'public' | 'private';
  status: TournamentStatus;
  /** Tournament lifecycle; defaults to registration until started. */
  phase?: TournamentPhase;
  startedAt?: string;
  /** Classification configuration. */
  classificationMatchesPerOpponent?: number;
  /**
   * Category distribution config. Example:
   * { Gold: 0.34, Silver: 0.33, Bronze: 0.33 } (fractions are normalized).
   * If categories are empty/omitted, single-category behavior uses `singleCategoryAdvanceFraction`.
   */
  categoryFractions?: Partial<Record<TournamentCategory, number>>;
  /** When only one (or no) category is configured, fraction of teams that advance (default 0.5). */
  singleCategoryAdvanceFraction?: number;
  /**
   * Legacy field; category matches are always generated as single-elimination brackets.
   * New tournaments should store `single_elim`.
   */
  categoryPhaseFormat?: 'round_robin' | 'single_elim';
  /** Frozen category bracket (generated server-side on finalize classification). */
  categoriesSnapshot?: {
    computedAt: string;
    divisions: {
      division: TournamentDivision | string;
      categories: {
        category: TournamentCategory;
        teamIds: string[];
        matchIds: string[];
      }[];
    }[];
  };
  organizerIds: string[];
  /**
   * Subset of organizerIds who do not play (no roster entry). They must list which divisions they cover in `organizerOnlyCovers`.
   */
  organizerOnlyIds?: string[];
  /**
   * Per organize-only organizer: divisions they are responsible for (must cover collectively with playing organizers per division rules).
   */
  organizerOnlyCovers?: Partial<Record<string, TournamentDivision[]>>;
  /** Populated by GET /api/tournaments list (rostered players = sum of team playerIds). */
  entriesCount?: number;
  /** Per-division rostered players (preferred over splitting `entriesCount` in the UI). */
  entriesCountByDivision?: Partial<Record<TournamentDivision, number>>;
  /** Populated by GET /api/tournaments list (count of team documents). */
  teamsCount?: number;
  /** Per-division team counts. */
  teamsCountByDivision?: Partial<Record<TournamentDivision, number>>;
  /** Populated by GET /api/tournaments list (groups with ≥1 team vs `groupCount`). */
  groupsWithTeamsCount?: number;
  /** Distinct group slots with ≥1 team per division. */
  groupsWithTeamsCountByDivision?: Partial<Record<TournamentDivision, number>>;
  /** Populated by GET /api/tournaments list (waitlist entries). */
  waitlistCount?: number;
  /**
   * Per-division waiting list counts (preferred over `waitlistCount` for UI).
   * Populated by GET /api/tournaments list and GET /api/tournaments/:id.
   */
  waitlistCountByDivision?: Partial<Record<TournamentDivision, number>>;
  /** Loaded on GET /api/tournaments/:id. The `note` field on each guest is omitted unless the viewer is an organizer or admin. */
  guestPlayers?: TournamentGuestPlayer[];
  /** Internal betting (virtual points); default false for older tournaments. */
  bettingEnabled?: boolean;
  bettingAllowWinner?: boolean;
  bettingAllowScore?: boolean;
  bettingAnonymous?: boolean;
  /** Present when loaded with `betsDivision` query. */
  bettingSnapshot?: TournamentBettingSnapshot;
  createdAt: string;
  updatedAt: string;
}

export type MatchStage = 'classification' | 'category';

export type MatchStatus = 'scheduled' | 'in_progress' | 'paused' | 'completed';

export interface Match {
  _id: string;
  tournamentId: string;
  stage: MatchStage;
  division?: TournamentDivision;
  groupIndex?: number;
  category?: TournamentCategory;
  teamAId: string;
  teamBId: string;
  /** Category knockout: filled when feeder match completes (winner → this slot). */
  advanceTeamAFromMatchId?: string;
  advanceTeamBFromMatchId?: string;
  /** Category knockout bronze: loser of feeder match fills this slot. */
  advanceTeamALoserFromMatchId?: string;
  advanceTeamBLoserFromMatchId?: string;
  /** 1-based logical round within the category bracket (larger = closer to final). */
  bracketRound?: number;
  isBronzeMatch?: boolean;
  /** 1 = single set, 3 = best-of-3, etc. */
  setsPerMatch: number;
  pointsToWin: number;
  status: MatchStatus;
  /** Stored as total sets won; points are optional (if you later store per-set). */
  setsWonA?: number;
  setsWonB?: number;
  pointsA?: number;
  pointsB?: number;
  winnerId?: string;
  startedAt?: string;
  completedAt?: string;
  /** When set and status is in_progress, only this referee (or org/admin) can edit score. */
  refereeUserId?: string;
  /**
   * Referee lock expiry timestamp (ISO). Live-scoring mutations require:
   * - `refereeUserId === actor`
   * - `refereeLockExpiresAt` in the future
   * Referee keeps it alive via a heartbeat.
   */
  refereeLockExpiresAt?: string;
  /** Suggested/claimed referee team (must not be playing). */
  refereeTeamId?: string;
  /** Global serve order (length 4): A1, B1, A2, B2 by default. */
  serveOrder?: string[];
  /** Current server (while match is in progress). */
  servingPlayerId?: string;
  /** Current server index in serveOrder (0..3). */
  serveIndex?: number;
  /** Duration in seconds (set on completion). */
  durationSeconds?: number;
  /** Accumulated duration in seconds while paused/resumed (non-final). */
  elapsedSeconds?: number;
  /** When present, match is paused (status = paused). */
  pausedAt?: string;
  /** Deterministic ordering within a stage slice (group/category). */
  orderIndex?: number;
  /** Optional scheduled timestamp for UI/ordering. */
  scheduledAt?: string;
  /**
   * Optional audit trail for live scoring. Server appends entries on `refereePoint`.
   * Kept bounded server-side to avoid unbounded growth.
   */
  scoreEvents?: {
    ts: string;
    userId: string;
    refereeTeamId?: string;
    side: 'A' | 'B';
    delta: 1 | -1;
    pointsA: number;
    pointsB: number;
    /** Set on delta +1: serveIndex (0..3) before that point was applied; used to restore serve on undo. */
    serveIndexBefore?: number;
  }[];
  /** Simple anti-spam / rate limit marker for live scoring. */
  lastPointAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  _id: string;
  tournamentId: string;
  name: string;
  playerIds: string[];
  /** 0-based; capacity per group = maxTeams / groupCount (at least 2). `null` until organizer distributes teams into groups. */
  groupIndex?: number | null;
  /** Derived once the tournament is categorized (server-side). */
  division?: TournamentDivision;
  /** Derived once the tournament is categorized (server-side). */
  category?: TournamentCategory;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'tournament.waitlistJoined'
  | 'waitlist.teamInvite'
  | 'team.created'
  | 'team.dissolved'
  | 'match.scheduled'
  | 'match.started'
  | 'match.ended'
  | 'match.refereeAssigned'
  | 'tournament.classified';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  /** Translation params for client-side i18n rendering. */
  params?: Record<string, string | number | boolean>;
  /** Deep link payload. */
  data?: {
    tournamentId?: string;
    matchId?: string;
    teamId?: string;
    fromUserId?: string;
  } & Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export type EntryStatus = 'joined' | 'in_team';

/**
 * Tournament roster row: either a registered user (`userId`) or a guest player (`guestPlayerId`), never both.
 * Legacy rows only have `userId`.
 */
export interface Entry {
  _id: string;
  tournamentId: string;
  userId?: string | null;
  guestPlayerId?: string | null;
  teamId: string | null;
  lookingForPartner: boolean;
  status: EntryStatus;
  createdAt: string;
  updatedAt: string;
}

/** Physical player without app account; scoped to one tournament. Referenced from `teams.playerIds` as `guest:<_id>`. */
export interface TournamentGuestPlayer {
  _id: string;
  tournamentId: string;
  displayName: string;
  gender: Gender;
  /** Organizer memo; may be absent in tournament GET responses for non-organizers. */
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
