/**
 * Dev-only mock data when EXPO_PUBLIC_API_URL is unset.
 * 16 users, one tournament, teams mix (full, partial roster, players looking for partner).
 */
import type {
  User,
  Tournament,
  Team,
  Entry,
  Match,
  TournamentGuestPlayer,
  TournamentBettingSnapshot,
  TournamentDivision,
} from '@/types';

export const DEV_TOURNAMENT_ID = '1';

/** Stable ObjectId-shaped id for dev guest roster rows (`guest:` + this). */
export const MOCK_DEV_GUEST_PLAYER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

const TS = '2026-01-01T00:00:00.000Z';

export const MOCK_DEV_GUEST_PLAYERS: TournamentGuestPlayer[] = [
  {
    _id: MOCK_DEV_GUEST_PLAYER_ID,
    tournamentId: DEV_TOURNAMENT_ID,
    displayName: 'Local Guest (Dev)',
    gender: 'female',
    createdBy: 'mock-u-1',
    createdAt: TS,
    updatedAt: TS,
  },
];

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
  guestPlayers: MOCK_DEV_GUEST_PLAYERS,
  bettingEnabled: true,
  bettingAllowWinner: true,
  bettingAllowScore: true,
  bettingAnonymous: false,
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
    playerIds: ['mock-u-9', `guest:${MOCK_DEV_GUEST_PLAYER_ID}`],
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
  {
    _id: 'mock-e-10',
    tournamentId: DEV_TOURNAMENT_ID,
    guestPlayerId: MOCK_DEV_GUEST_PLAYER_ID,
    teamId: 'mock-team-5',
    lookingForPartner: false,
    status: 'in_team',
    createdAt: TS,
    updatedAt: TS,
  },
  {
    _id: 'mock-e-10b',
    tournamentId: DEV_TOURNAMENT_ID,
    userId: 'mock-u-10',
    teamId: null,
    lookingForPartner: true,
    status: 'joined',
    createdAt: TS,
    updatedAt: TS,
  },
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

/**
 * Rich betting snapshot for the Bets tab (EXPO dev mocks). Multiple players per match:
 * scheduled (many picks), live (crowd %), completed (settled points on lines).
 * Gold single-elim match ids align with `MOCK_DEV_CATEGORY_MATCHES`.
 */
export function getMockDevBettingSnapshot(
  tournamentId: string,
  division: TournamentDivision
): TournamentBettingSnapshot {
  if (String(tournamentId) !== String(DEV_TOURNAMENT_ID) || division !== 'mixed') {
    return {
      bettingEnabled: false,
      bettingAllowWinner: false,
      bettingAllowScore: false,
      bettingAnonymous: false,
      leaderboard: [] as TournamentBettingSnapshot['leaderboard'],
      matches: [],
    };
  }

  const teamName = (id: string) => MOCK_DEV_TEAMS.find((t) => t._id === id)?.name ?? id;

  return {
    bettingEnabled: true,
    bettingAllowWinner: true,
    bettingAllowScore: true,
    bettingAnonymous: false,
    leaderboard: [
      { userId: 'mock-u-3', points: 7, exactHits: 2, picksCount: 8 },
      { userId: 'mock-u-5', points: 5, exactHits: 1, picksCount: 6 },
      { userId: 'mock-u-10', points: 4, exactHits: 1, picksCount: 10 },
      { userId: 'mock-u-14', points: 3, exactHits: 0, picksCount: 9 },
      { userId: 'mock-u-2', points: 2, exactHits: 0, picksCount: 7 },
      { userId: 'mock-u-16', points: 1, exactHits: 0, picksCount: 5 },
    ],
    matches: [
      {
        matchId: DEV_CAT_GOLD_SF1,
        teamAId: 'mock-team-1',
        teamBId: 'mock-team-2',
        teamAName: teamName('mock-team-1'),
        teamBName: teamName('mock-team-2'),
        status: 'scheduled',
        winnerPctA: null,
        winnerPctB: null,
        winnerCountA: 0,
        winnerCountB: 0,
        lines: [
          { userId: 'mock-u-10', kind: 'winner', pickWinnerTeamId: 'mock-team-1' },
          { userId: 'mock-u-11', kind: 'winner', pickWinnerTeamId: 'mock-team-2' },
          { userId: 'mock-u-12', kind: 'winner', pickWinnerTeamId: 'mock-team-1' },
          { userId: 'mock-u-13', kind: 'score', pickPointsA: 21, pickPointsB: 19 },
          { userId: 'mock-u-14', kind: 'score', pickPointsA: 21, pickPointsB: 16 },
          { userId: 'mock-u-15', kind: 'score', pickPointsA: 18, pickPointsB: 21 },
          { userId: 'mock-u-16', kind: 'score', pickPointsA: 22, pickPointsB: 20 },
        ],
      },
      {
        matchId: DEV_CAT_GOLD_SF2,
        teamAId: 'mock-team-3',
        teamBId: 'mock-team-4',
        teamAName: teamName('mock-team-3'),
        teamBName: teamName('mock-team-4'),
        status: 'in_progress',
        winnerPctA: 0.58,
        winnerPctB: 0.42,
        winnerCountA: 9,
        winnerCountB: 6,
        lines: [
          { userId: 'mock-u-1', kind: 'winner', pickWinnerTeamId: 'mock-team-3' },
          { userId: 'mock-u-2', kind: 'winner', pickWinnerTeamId: 'mock-team-4' },
          { userId: 'mock-u-4', kind: 'winner', pickWinnerTeamId: 'mock-team-3' },
          { userId: 'mock-u-6', kind: 'score', pickPointsA: 21, pickPointsB: 18 },
          { userId: 'mock-u-7', kind: 'score', pickPointsA: 19, pickPointsB: 21 },
          { userId: 'mock-u-8', kind: 'score', pickPointsA: 21, pickPointsB: 21 },
        ],
      },
      {
        matchId: DEV_CAT_GOLD_FIN,
        teamAId: 'mock-team-1',
        teamBId: 'mock-team-3',
        teamAName: teamName('mock-team-1'),
        teamBName: teamName('mock-team-3'),
        status: 'completed',
        winnerPctA: null,
        winnerPctB: null,
        winnerCountA: 0,
        winnerCountB: 0,
        lines: [
          { userId: 'mock-u-3', kind: 'winner', pickWinnerTeamId: 'mock-team-1', pointsAwarded: 3 },
          { userId: 'mock-u-5', kind: 'winner', pickWinnerTeamId: 'mock-team-1', pointsAwarded: 3 },
          { userId: 'mock-u-9', kind: 'winner', pickWinnerTeamId: 'mock-team-3', pointsAwarded: 0 },
          { userId: 'mock-u-3', kind: 'score', pickPointsA: 21, pickPointsB: 17, pointsAwarded: 5 },
          { userId: 'mock-u-5', kind: 'score', pickPointsA: 21, pickPointsB: 19, pointsAwarded: 2 },
          { userId: 'mock-u-14', kind: 'score', pickPointsA: 20, pickPointsB: 21, pointsAwarded: 0 },
        ],
      },
      {
        matchId: DEV_CAT_GOLD_BRONZE,
        teamAId: 'mock-team-2',
        teamBId: 'mock-team-4',
        teamAName: teamName('mock-team-2'),
        teamBName: teamName('mock-team-4'),
        status: 'scheduled',
        winnerPctA: null,
        winnerPctB: null,
        winnerCountA: 0,
        winnerCountB: 0,
        lines: [
          { userId: 'mock-u-4', kind: 'winner', pickWinnerTeamId: 'mock-team-2' },
          { userId: 'mock-u-8', kind: 'winner', pickWinnerTeamId: 'mock-team-4' },
          { userId: 'mock-u-15', kind: 'score', pickPointsA: 21, pickPointsB: 15 },
        ],
      },
    ],
  };
}

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
