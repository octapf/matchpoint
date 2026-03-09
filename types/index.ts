/**
 * Matchpoint data types
 */

export type Gender = 'male' | 'female' | 'other';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: Gender;
  authProvider: 'google' | 'apple';
  createdAt: string;
  updatedAt: string;
}

export type TournamentStatus = 'open' | 'full' | 'cancelled';

export interface Tournament {
  _id: string;
  name: string;
  date: string;
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
