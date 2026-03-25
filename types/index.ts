/**
 * Matchpoint data types
 */

export type Gender = 'male' | 'female';

export type UserRole = 'user' | 'admin';

export interface User {
  _id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  phone?: string;
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

export interface Tournament {
  _id: string;
  name: string;
  /** @deprecated Use startDate. Kept for backward compat. */
  date?: string;
  startDate: string;
  endDate: string;
  location: string;
  description?: string;
  maxTeams: number;
  inviteLink: string;
  status: TournamentStatus;
  organizerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  _id: string;
  tournamentId: string;
  name: string;
  playerIds: string[];
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
