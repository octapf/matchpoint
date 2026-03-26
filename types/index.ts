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
  /** @deprecated Legacy field; prefer `username`. Cleared when username is updated. */
  displayName?: string;
  phone?: string;
  /** When true, other authenticated users may see `phone` on your public profile. */
  phoneVisible?: boolean;
  gender?: Gender;
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

export interface Tournament {
  _id: string;
  name: string;
  /** @deprecated Use startDate. Kept for backward compat. */
  date?: string;
  startDate: string;
  endDate: string;
  location: string;
  description?: string;
  /** Enabled divisions for registration/competition. Must include at least one. */
  divisions?: TournamentDivision[];
  /**
   * Optional sub-categories inside a division (e.g. Gold/Silver).
   * Empty/omitted means a single unnamed category.
   */
  categories?: string[];
  maxTeams: number;
  /** Number of groups (min 2, default 4). maxTeams ÷ groupCount must be ≥ 2 (default capacity 4 per group with 16 max teams). */
  groupCount?: number;
  inviteLink: string;
  status: TournamentStatus;
  organizerIds: string[];
  /** Populated by GET /api/tournaments list (count of entry documents). */
  entriesCount?: number;
  /** Populated by GET /api/tournaments list (count of team documents). */
  teamsCount?: number;
  /** Populated by GET /api/tournaments list (groups with ≥1 team vs `groupCount`). */
  groupsWithTeamsCount?: number;
  /** Populated by GET /api/tournaments list (waitlist entries). */
  waitlistCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  _id: string;
  tournamentId: string;
  name: string;
  playerIds: string[];
  /** 0-based; capacity per group = maxTeams / groupCount (at least 2). Omit on create to auto-fill least-loaded group. */
  groupIndex?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryStatus = 'joined' | 'in_team';

export interface Entry {
  _id: string;
  tournamentId: string;
  userId: string;
  teamId: string | null;
  lookingForPartner: boolean;
  status: EntryStatus;
  createdAt: string;
  updatedAt: string;
}
