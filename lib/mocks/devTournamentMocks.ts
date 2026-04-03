/**
 * Dev-only mock data when EXPO_PUBLIC_API_URL is unset.
 * 16 users, one tournament, teams mix (full, partial roster, players looking for partner).
 */
import type { User, Tournament, Team, Entry, Match } from '@/types';

export const DEV_TOURNAMENT_ID = '1';

const TS = '2026-01-01T00:00:00.000Z';

export const MOCK_DEV_TOURNAMENT: Tournament = {
  _id: DEV_TOURNAMENT_ID,
  name: 'Summer Beach Cup (Dev)',
  date: '2026-07-15',
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  location: 'Barceloneta Beach',
  description: 'Mock tournament for local development.',
  // Keep mock data consistent with mock teams (mostly mixed pairs).
  divisions: ['mixed'],
  categories: ['Gold', 'Silver', 'Bronze'],
  phase: 'categories',
  startedAt: TS,
  categoryPhaseFormat: 'single_elim',
  categoriesSnapshot: {
    computedAt: TS,
    divisions: [
      {
        division: 'mixed',
        categories: [
          {
            category: 'Gold',
            teamIds: ['mock-team-1', 'mock-team-2', 'mock-team-3', 'mock-team-4'],
            matchIds: [
              'dev-cat-gold-sf1',
              'dev-cat-gold-sf2',
              'dev-cat-gold-fin',
              'dev-cat-gold-bronze',
            ],
          },
        ],
      },
    ],
  },
  maxTeams: 16,
  pointsToWin: 21,
  setsPerMatch: 1,
  groupCount: 4,
  inviteLink: 'dev-invite',
  visibility: 'public',
  status: 'open',
  organizerIds: ['mock-u-1'],
  waitlistCount: 0,
  groupsDistributedAt: TS,
  createdAt: TS,
  updatedAt: TS,
};

/** 16 players: firstName Seed1…Seed16, lastName Bot (matches DB seed naming) */
export const MOCK_DEV_USERS: User[] = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1;
  const nn = String(n).padStart(2, '0');
  return {
    _id: `mock-u-${n}`,
    username: `seed_player${nn}`,
    firstName: `Seed${n}`,
    lastName: 'Bot',
    gender: i % 2 === 0 ? ('male' as const) : ('female' as const),
    authProvider: 'google' as const,
    createdAt: TS,
    updatedAt: TS,
  };
});

/** Five full pairs, two incomplete teams (one slot open), for team-card edge cases */
export const MOCK_DEV_TEAMS: Team[] = [
  {
    _id: 'mock-team-1',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Team Alpha',
    groupIndex: 0,
    playerIds: ['mock-u-1', 'mock-u-2'],
    createdBy: 'mock-u-1',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-2',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Beach Kings',
    groupIndex: 0,
    playerIds: ['mock-u-3', 'mock-u-4'],
    createdBy: 'mock-u-3',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-3',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Sand Setters',
    groupIndex: 1,
    playerIds: ['mock-u-5', 'mock-u-6'],
    createdBy: 'mock-u-5',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-4',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Net Ninjas',
    groupIndex: 1,
    playerIds: ['mock-u-7', 'mock-u-8'],
    createdBy: 'mock-u-7',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-5',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Spike Squad',
    groupIndex: 2,
    playerIds: ['mock-u-9', 'mock-u-10'],
    createdBy: 'mock-u-9',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-6',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Need Partner A',
    groupIndex: 2,
    playerIds: ['mock-u-11'],
    createdBy: 'mock-u-11',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-team-7',
    tournamentId: DEV_TOURNAMENT_ID,
    name: 'Need Partner B',
    groupIndex: 3,
    playerIds: ['mock-u-12'],
    createdBy: 'mock-u-12',
    createdAt: TS,
    updatedAt: TS,
  },
];

export const MOCK_DEV_ENTRIES: Entry[] = [
  { _id: 'mock-e-1', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-1', teamId: 'mock-team-1', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-2', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-2', teamId: 'mock-team-1', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-3', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-3', teamId: 'mock-team-2', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-4', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-4', teamId: 'mock-team-2', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-5', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-5', teamId: 'mock-team-3', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-6', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-6', teamId: 'mock-team-3', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-7', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-7', teamId: 'mock-team-4', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-8', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-8', teamId: 'mock-team-4', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-9', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-9', teamId: 'mock-team-5', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-10', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-10', teamId: 'mock-team-5', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-11', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-11', teamId: 'mock-team-6', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
  { _id: 'mock-e-12', tournamentId: DEV_TOURNAMENT_ID, userId: 'mock-u-12', teamId: 'mock-team-7', lookingForPartner: false, status: 'in_team', createdAt: TS, updatedAt: TS },
];

const userById = new Map(MOCK_DEV_USERS.map((u) => [u._id, u]));

export function getMockDevUsersByIds(ids: string[]): User[] {
  const out: User[] = [];
  for (const id of ids) {
    const u = userById.get(id);
    if (u) out.push(u);
  }
  return out;
}

export function getMockDevUserById(id: string): User | null {
  return userById.get(id) ?? null;
}

const DEV_CAT_GOLD_SF1 = 'dev-cat-gold-sf1';
const DEV_CAT_GOLD_SF2 = 'dev-cat-gold-sf2';
const DEV_CAT_GOLD_FIN = 'dev-cat-gold-fin';
const DEV_CAT_GOLD_BRONZE = 'dev-cat-gold-bronze';

/** Gold single-elim (4 teams): semis → final + bronze; for offline bracket UI. */
export const MOCK_DEV_CATEGORY_MATCHES: Match[] = [
  {
    _id: DEV_CAT_GOLD_SF1,
    tournamentId: DEV_TOURNAMENT_ID,
    stage: 'category',
    division: 'mixed',
    category: 'Gold',
    teamAId: 'mock-team-1',
    teamBId: 'mock-team-2',
    setsPerMatch: 1,
    pointsToWin: 21,
    status: 'scheduled',
    bracketRound: 1,
    orderIndex: 0,
    pointsA: 0,
    pointsB: 0,
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: DEV_CAT_GOLD_SF2,
    tournamentId: DEV_TOURNAMENT_ID,
    stage: 'category',
    division: 'mixed',
    category: 'Gold',
    teamAId: 'mock-team-3',
    teamBId: 'mock-team-4',
    setsPerMatch: 1,
    pointsToWin: 21,
    status: 'scheduled',
    bracketRound: 1,
    orderIndex: 1,
    pointsA: 0,
    pointsB: 0,
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: DEV_CAT_GOLD_FIN,
    tournamentId: DEV_TOURNAMENT_ID,
    stage: 'category',
    division: 'mixed',
    category: 'Gold',
    teamAId: '',
    teamBId: '',
    advanceTeamAFromMatchId: DEV_CAT_GOLD_SF1,
    advanceTeamBFromMatchId: DEV_CAT_GOLD_SF2,
    setsPerMatch: 1,
    pointsToWin: 21,
    status: 'scheduled',
    bracketRound: 2,
    orderIndex: 0,
    pointsA: 0,
    pointsB: 0,
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: DEV_CAT_GOLD_BRONZE,
    tournamentId: DEV_TOURNAMENT_ID,
    stage: 'category',
    division: 'mixed',
    category: 'Gold',
    teamAId: '',
    teamBId: '',
    advanceTeamALoserFromMatchId: DEV_CAT_GOLD_SF1,
    advanceTeamBLoserFromMatchId: DEV_CAT_GOLD_SF2,
    isBronzeMatch: true,
    setsPerMatch: 1,
    pointsToWin: 21,
    status: 'scheduled',
    bracketRound: 3,
    orderIndex: 2,
    pointsA: 0,
    pointsB: 0,
    createdAt: TS,
    updatedAt: TS,
  },
];
