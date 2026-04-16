/**
 * Dev tournament seed: 120 users (firstName Seed1…Seed120, lastName Bot), one tournament, teams, entries.
 * Classification + category matches are mocked; multi-user tournament bets per match, then settled.
 * Used by POST /api/admin and scripts/seed-dev-tournament.ts
 */
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { actionPublishCategoryMatches, actionStartTournament } from './tournamentLifecycle';
import { applyCategoryKnockoutAdvances } from './knockoutAdvance';
import { ensureTournamentBetIndexes, settleBetsForMatch, type BetKind } from './tournamentBets';

export const DEV_SEED_INVITE_LINK = 'seed-dev-beach-cup';
export const DEV_SEED_LOGIN_PASSWORD = 'SeedDev1!';

/** Any dev seed login email: seed.player + digits + @matchpoint.dev (case-insensitive). */
const SEED_USER_EMAIL_MONGO_RE = /^seed\.player\d+@matchpoint\.dev$/i;

type SeedDivision = 'men' | 'women' | 'mixed';
type SeedPlayerSpec = {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  division: SeedDivision;
};

const USERS_PER_DIVISION = 40;
// Per-division default: 4 groups × 4 teams = 16 teams per division (men/women/mixed).
const TEAMS_PER_DIVISION = 16;
const GROUPS_PER_DIVISION = 4;
const PLAYERS_PER_TEAM = 2;

const MEN_PLAYERS = Array.from({ length: USERS_PER_DIVISION }, (_, i) => ({
  firstName: `SeedM${i + 1}`,
  lastName: 'Bot',
  gender: 'male' as const,
  division: 'men' as const,
}));

const WOMEN_PLAYERS = Array.from({ length: USERS_PER_DIVISION }, (_, i) => ({
  firstName: `SeedW${i + 1}`,
  lastName: 'Bot',
  gender: 'female' as const,
  division: 'women' as const,
}));

const MIXED_PLAYERS = [
  ...Array.from({ length: USERS_PER_DIVISION / 2 }, (_, i) => ({
    firstName: `SeedX${i + 1}M`,
    lastName: 'Bot',
    gender: 'male' as const,
    division: 'mixed' as const,
  })),
  ...Array.from({ length: USERS_PER_DIVISION / 2 }, (_, i) => ({
    firstName: `SeedX${i + 1}W`,
    lastName: 'Bot',
    gender: 'female' as const,
    division: 'mixed' as const,
  })),
];

const PLAYERS: SeedPlayerSpec[] = [...MEN_PLAYERS, ...WOMEN_PLAYERS, ...MIXED_PLAYERS];

const SEEDED_TEAM_COUNT = TEAMS_PER_DIVISION * 3;
const SEEDED_ENTRY_COUNT = SEEDED_TEAM_COUNT * PLAYERS_PER_TEAM;
const SEEDED_WAITLIST_COUNT = PLAYERS.length - SEEDED_ENTRY_COUNT;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Max mock bettors per match (unique index: one winner + one score bet per user per match). */
const MAX_MOCK_BETTORS_PER_MATCH = 8;

/** Same rules as API: same division, not playing in the match; stable sort by userId. */
function eligibleBettorsForMatch(
  teamAId: string,
  teamBId: string,
  division: SeedDivision,
  teamPlayerIdsByTeamId: Map<string, string[]>,
  teamDivisionByTeamId: Map<string, SeedDivision>,
  entryList: readonly { userId: string; teamId: string }[]
): string[] {
  const pa = teamPlayerIdsByTeamId.get(teamAId) ?? [];
  const pb = teamPlayerIdsByTeamId.get(teamBId) ?? [];
  const playing = new Set([...pa, ...pb]);
  const out: string[] = [];
  for (const e of entryList) {
    if (teamDivisionByTeamId.get(e.teamId) !== division) continue;
    if (playing.has(e.userId)) continue;
    out.push(e.userId);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function selectMockBettorUserIds(matchId: string, eligible: string[]): string[] {
  if (eligible.length === 0) return [];
  const k = Math.min(MAX_MOCK_BETTORS_PER_MATCH, eligible.length);
  const idxs = eligible.map((_, i) => i);
  idxs.sort((a, b) => hashStr(`${matchId}-sel-${a}`) - hashStr(`${matchId}-sel-${b}`));
  return idxs.slice(0, k).map((i) => eligible[i]!);
}

function appendMockBetsForMatch(
  betDocs: Record<string, unknown>[],
  args: {
    tournamentId: string;
    division: SeedDivision;
    matchId: string;
    nowIso: string;
    teamAId: string;
    teamBId: string;
    winnerId: string;
    pointsA: number;
    pointsB: number;
    pointsToWin: number;
    teamPlayerIdsByTeamId: Map<string, string[]>;
    teamDivisionByTeamId: Map<string, SeedDivision>;
    entryList: readonly { userId: string; teamId: string }[];
  }
): void {
  const eligible = eligibleBettorsForMatch(
    args.teamAId,
    args.teamBId,
    args.division,
    args.teamPlayerIdsByTeamId,
    args.teamDivisionByTeamId,
    args.entryList
  );
  const bettors = selectMockBettorUserIds(args.matchId, eligible);
  const { winnerId, pointsA, pointsB, teamAId, teamBId, pointsToWin, tournamentId, division, matchId, nowIso } = args;

  for (const uid of bettors) {
    const pickVariant = hashStr(`${matchId}-bet-${uid}`) % 4;
    let pickWinner = winnerId;
    let pickA = pointsA;
    let pickB = pointsB;
    if (pickVariant === 1) {
      pickWinner = winnerId;
      pickA = Math.max(0, pointsA - 1);
      pickB = pointsB;
      if (pickA === pointsA && pickB === pointsB) pickA = Math.min(pointsToWin, pointsA + 1);
    } else if (pickVariant === 2) {
      pickWinner = winnerId === teamAId ? teamBId : teamAId;
      pickA = 12;
      pickB = 18;
    }

    const base = {
      tournamentId,
      division,
      matchId,
      userId: uid,
      status: 'pending' as const,
      pointsAwarded: 0,
      settledAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    betDocs.push(
      { ...base, kind: 'winner' as BetKind, pickWinnerTeamId: pickWinner },
      { ...base, kind: 'score' as BetKind, pickPointsA: pickA, pickPointsB: pickB }
    );
  }
}

/**
 * Complete every scheduled category match that already has both teams, in bracket order:
 * mock bets → complete → settle → knockout advances (feeds next rounds).
 */
async function seedCompleteCategoryBracketWithMockBets(
  db: Db,
  tournamentId: string,
  nowIso: string,
  teamPlayerIdsByTeamId: Map<string, string[]>,
  teamDivisionByTeamId: Map<string, SeedDivision>,
  entryList: readonly { userId: string; teamId: string }[]
): Promise<void> {
  const matchesCol = db.collection('matches');
  const betsCol = db.collection('tournamentBets');
  await ensureTournamentBetIndexes(db);

  for (let iter = 0; iter < 500; iter++) {
    const pending = await matchesCol
      .find({ tournamentId, stage: 'category', status: 'scheduled' })
      .toArray();
    const ready = pending.filter((raw) => {
      const a = String((raw as { teamAId?: unknown }).teamAId ?? '');
      const b = String((raw as { teamBId?: unknown }).teamBId ?? '');
      return ObjectId.isValid(a) && ObjectId.isValid(b);
    });
    if (ready.length === 0) break;

    ready.sort((a, b) => {
      const ra = Number((a as { bracketRound?: unknown }).bracketRound ?? 0);
      const rb = Number((b as { bracketRound?: unknown }).bracketRound ?? 0);
      if (ra !== rb) return ra - rb;
      const oa = Number((a as { orderIndex?: unknown }).orderIndex ?? 0);
      const ob = Number((b as { orderIndex?: unknown }).orderIndex ?? 0);
      if (oa !== ob) return oa - ob;
      return String(a._id).localeCompare(String(b._id));
    });

    const raw = ready[0]!;
    const m = raw as {
      _id: ObjectId;
      teamAId?: string;
      teamBId?: string;
      division?: unknown;
      pointsToWin?: unknown;
    };
    const teamAId = String(m.teamAId ?? '');
    const teamBId = String(m.teamBId ?? '');
    const mid = m._id.toString();
    const divRaw = String(m.division ?? '');
    const division: SeedDivision | null =
      divRaw === 'men' || divRaw === 'women' || divRaw === 'mixed' ? divRaw : null;
    const pointsToWin = Math.max(1, Math.min(99, Math.floor(Number(m.pointsToWin ?? 21) || 21)));

    const seed = hashStr(`${teamAId}-${teamBId}-${mid}`);
    const aWins = seed % 2 === 0;
    const loserPts = Math.max(0, pointsToWin - 2 - (seed % 8));
    const pointsA = aWins ? pointsToWin : loserPts;
    const pointsB = aWins ? loserPts : pointsToWin;
    const winnerId = aWins ? teamAId : teamBId;
    const loserId = aWins ? teamBId : teamAId;

    const betDocs: Record<string, unknown>[] = [];
    if (division) {
      appendMockBetsForMatch(betDocs, {
        tournamentId,
        division,
        matchId: mid,
        nowIso,
        teamAId,
        teamBId,
        winnerId,
        pointsA,
        pointsB,
        pointsToWin,
        teamPlayerIdsByTeamId,
        teamDivisionByTeamId,
        entryList,
      });
    }
    if (betDocs.length) await betsCol.insertMany(betDocs);

    await matchesCol.updateOne(
      { _id: m._id },
      {
        $set: {
          status: 'completed',
          setsWonA: aWins ? 1 : 0,
          setsWonB: aWins ? 0 : 1,
          pointsA,
          pointsB,
          winnerId,
          completedAt: nowIso,
          updatedAt: nowIso,
        },
      }
    );
    await settleBetsForMatch(db, tournamentId, mid);
    await applyCategoryKnockoutAdvances(db, tournamentId, mid, winnerId, loserId, nowIso);
  }
}

function canonicalSeedEmail(oneBasedIndex: number): string {
  return `seed.player${String(oneBasedIndex).padStart(2, '0')}@matchpoint.dev`.toLowerCase();
}

function canonicalSeedUsername(oneBasedIndex: number): string {
  return `seed_player${String(oneBasedIndex).padStart(2, '0')}`;
}

/**
 * Fixes drift / casing / padding on seed users. Matches by _id after a flexible email query
 * so updates apply even if the stored email is not byte-identical to the canonical form.
 */
export async function syncSeedUserNames(db: Db): Promise<void> {
  const users = db.collection('users');
  const now = new Date().toISOString();
  const docs = await users.find({ email: { $regex: SEED_USER_EMAIL_MONGO_RE } }).toArray();
  for (const doc of docs) {
    const raw = String((doc as { email?: string }).email ?? '').trim();
    const m = raw.match(/^seed\.player(\d+)@matchpoint\.dev$/i);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (num < 1 || num > PLAYERS.length) continue;
    const p = PLAYERS[num - 1]!;
    await users.updateOne(
      { _id: doc._id as ObjectId },
      {
        $set: {
          email: canonicalSeedEmail(num),
          username: canonicalSeedUsername(num),
          firstName: p.firstName,
          lastName: p.lastName,
          updatedAt: now,
        },
        $unset: { displayName: '' },
      }
    );
  }
}

export type DevSeedUserRow = {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
};

export type DevSeedInfo = {
  exists: boolean;
  tournamentId: string | null;
  inviteLink: string;
  password: string;
  users: DevSeedUserRow[];
};

export type DevSeedRunResult = DevSeedInfo & {
  alreadyExists: boolean;
  teamsCount?: number;
  entriesCount?: number;
  waitlistCount?: number;
};

export type DevSeedPurgeResult = {
  removed: {
    tournament: boolean;
    teams: number;
    entries: number;
    waitlist: number;
    tournamentBets: number;
    users: number;
  };
};

/**
 * Deletes the dev seed tournament (invite `seed-dev-beach-cup`), its teams and entries,
 * then all users with emails `seed.playerNN@matchpoint.dev`. Idempotent.
 */
export async function purgeDevSeed(db: Db): Promise<DevSeedPurgeResult> {
  const tournaments = db.collection('tournaments');
  const users = db.collection('users');
  const teams = db.collection('teams');
  const entries = db.collection('entries');
  const waitlist = db.collection('waitlist');
  const tournamentBets = db.collection('tournamentBets');

  const existing = await tournaments.findOne({ inviteLink: DEV_SEED_INVITE_LINK });
  let teamsDel = 0;
  let entriesDel = 0;
  let waitlistDel = 0;
  let tournamentBetsDel = 0;
  let tournamentRemoved = false;

  if (existing) {
    const tid = existing._id.toString();
    const tournamentIdFilter = { $in: [tid, existing._id] };
    const er = await entries.deleteMany({ tournamentId: tournamentIdFilter });
    entriesDel = er.deletedCount ?? 0;
    const tr = await teams.deleteMany({ tournamentId: tournamentIdFilter });
    teamsDel = tr.deletedCount ?? 0;
    const wr = await waitlist.deleteMany({ tournamentId: tournamentIdFilter });
    waitlistDel = wr.deletedCount ?? 0;
    const br = await tournamentBets.deleteMany({ tournamentId: tid });
    tournamentBetsDel = br.deletedCount ?? 0;
    await tournaments.deleteOne({ _id: existing._id });
    tournamentRemoved = true;
  }

  const ur = await users.deleteMany({ email: { $regex: SEED_USER_EMAIL_MONGO_RE } });
  const usersDel = ur.deletedCount ?? 0;

  return {
    removed: {
      tournament: tournamentRemoved,
      teams: teamsDel,
      entries: entriesDel,
      waitlist: waitlistDel,
      tournamentBets: tournamentBetsDel,
      users: usersDel,
    },
  };
}

async function fetchSeedUsers(db: Db): Promise<DevSeedUserRow[]> {
  const docs = await db
    .collection('users')
    .find({ email: { $regex: SEED_USER_EMAIL_MONGO_RE } })
    .sort({ email: 1 })
    .toArray();
  return docs.map((u) => {
    const plain = u as Record<string, unknown>;
    const id = plain._id as { toString: () => string };
    return {
      _id: id.toString(),
      email: String(plain.email ?? ''),
      username: String(plain.username ?? ''),
      firstName: String(plain.firstName ?? ''),
      lastName: String(plain.lastName ?? ''),
    };
  });
}

export async function getDevSeedInfo(db: Db): Promise<DevSeedInfo> {
  const tournament = await db.collection('tournaments').findOne({ inviteLink: DEV_SEED_INVITE_LINK });
  const users = await fetchSeedUsers(db);
  return {
    exists: !!tournament,
    tournamentId: tournament ? (tournament._id as { toString: () => string }).toString() : null,
    inviteLink: DEV_SEED_INVITE_LINK,
    password: DEV_SEED_LOGIN_PASSWORD,
    users,
  };
}

export async function runDevSeed(db: Db, options: { force: boolean }): Promise<DevSeedRunResult> {
  const tournaments = db.collection('tournaments');
  const users = db.collection('users');
  const teams = db.collection('teams');
  const entries = db.collection('entries');
  const waitlist = db.collection('waitlist');

  const existing = await tournaments.findOne({ inviteLink: DEV_SEED_INVITE_LINK });

  if (existing && !options.force) {
    const tournamentId = (existing as { _id: { toString: () => string } })._id.toString();
    const [teamsCount, entriesCount, waitlistCount] = await Promise.all([
      teams.countDocuments({ tournamentId }),
      entries.countDocuments({ tournamentId }),
      waitlist.countDocuments({ tournamentId }),
    ]);
    const currentDivisions = ((existing as { divisions?: unknown }).divisions ?? []) as string[];
    const currentCategories = ((existing as { categories?: unknown }).categories ?? []) as string[];
    const hasExpectedDivisions =
      currentDivisions.length === 3 &&
      currentDivisions.includes('men') &&
      currentDivisions.includes('women') &&
      currentDivisions.includes('mixed');
    const hasExpectedCategories =
      currentCategories.length === 3 &&
      currentCategories.includes('Gold') &&
      currentCategories.includes('Silver') &&
      currentCategories.includes('Bronze');
    const maxTeams = Number((existing as { maxTeams?: unknown }).maxTeams);
    const groupCount = Number((existing as { groupCount?: unknown }).groupCount);
    const expectedGroupCount = GROUPS_PER_DIVISION * 3;
    const bettingEnabled = !!(existing as { bettingEnabled?: unknown }).bettingEnabled;
    const bettingAllowWinner = !!(existing as { bettingAllowWinner?: unknown }).bettingAllowWinner;
    const bettingAllowScore = !!(existing as { bettingAllowScore?: unknown }).bettingAllowScore;
    const isUpToDate =
      hasExpectedDivisions &&
      hasExpectedCategories &&
      maxTeams === SEEDED_TEAM_COUNT &&
      groupCount === expectedGroupCount &&
      teamsCount === SEEDED_TEAM_COUNT &&
      entriesCount === SEEDED_ENTRY_COUNT &&
      waitlistCount === SEEDED_WAITLIST_COUNT &&
      bettingEnabled &&
      bettingAllowWinner &&
      bettingAllowScore;
    if (!isUpToDate) {
      await purgeDevSeed(db);
    } else {
      await syncSeedUserNames(db);
      const info = await getDevSeedInfo(db);
      return {
        ...info,
        alreadyExists: true,
      };
    }
  }

  await purgeDevSeed(db);

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(DEV_SEED_LOGIN_PASSWORD, 12);
  const userDocs = PLAYERS.map((p, i) => ({
    email: canonicalSeedEmail(i + 1),
    username: canonicalSeedUsername(i + 1),
    passwordHash,
    emailVerified: true,
    firstName: p.firstName,
    lastName: p.lastName,
    phone: '',
    gender: p.gender,
    authProvider: 'email',
    createdAt: now,
    updatedAt: now,
  }));
  const usersInsert = await users.insertMany(userDocs);
  const userIds = Array.from({ length: userDocs.length }, (_, i) => usersInsert.insertedIds[i]!.toString());

  const organizerId = userIds[0]!;
  const tournamentDoc = {
    name: 'Summer Beach Cup (Seed)',
    date: '2026-07-15',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    divisionDates: {
      men: { startDate: '2026-07-15', endDate: '2026-07-15' },
      women: { startDate: '2026-07-15', endDate: '2026-07-15' },
      mixed: { startDate: '2026-07-15', endDate: '2026-07-15' },
    },
    location: 'Barceloneta Beach',
    description: 'Seeded data for tournament / team development.',
    // Match tournament creation defaults (per division: 16 teams, 4 groups).
    divisions: ['men', 'women', 'mixed'],
    categories: ['Gold', 'Silver', 'Bronze'] as string[],
    maxTeams: SEEDED_TEAM_COUNT,
    pointsToWin: 21,
    setsPerMatch: 1,
    groupCount: GROUPS_PER_DIVISION * 3,
    inviteLink: DEV_SEED_INVITE_LINK,
    status: 'open',
    phase: 'registration',
    startedAt: null,
    classificationMatchesPerOpponent: 1,
    categoryFractions: null,
    singleCategoryAdvanceFraction: 0.5,
    /** UI / settings; category matches are always generated as single-elim bracket (see `generateCategoryMatches`). */
    categoryPhaseFormat: 'single_elim' as const,
    organizerIds: [organizerId],
    bettingEnabled: true,
    bettingAllowWinner: true,
    bettingAllowScore: true,
    bettingAnonymous: false,
    createdAt: now,
    updatedAt: now,
  };
  const tRes = await tournaments.insertOne(tournamentDoc);
  const tournamentId = tRes.insertedId.toString();

  const groupedUsers: Record<SeedDivision, { all: string[]; men: string[]; women: string[] }> = {
    men: { all: [], men: [], women: [] },
    women: { all: [], men: [], women: [] },
    mixed: { all: [], men: [], women: [] },
  };
  for (let i = 0; i < PLAYERS.length; i++) {
    const player = PLAYERS[i]!;
    const uid = userIds[i]!;
    groupedUsers[player.division].all.push(uid);
    if (player.gender === 'male') groupedUsers[player.division].men.push(uid);
    else groupedUsers[player.division].women.push(uid);
  }

  const waitingUserIds: string[] = [];
  const teamDocs: {
    tournamentId: string;
    name: string;
    groupIndex: number;
    playerIds: string[];
    division: SeedDivision;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }[] = [];
  const teamPlayersByIndex: string[][] = [];

  const divisionSpecs: { key: SeedDivision; label: string; groupOffset: number }[] = [
    { key: 'men', label: 'Men', groupOffset: 0 },
    { key: 'women', label: 'Women', groupOffset: GROUPS_PER_DIVISION },
    { key: 'mixed', label: 'Mixed', groupOffset: GROUPS_PER_DIVISION * 2 },
  ];

  for (const division of divisionSpecs) {
    const divisionUsers = groupedUsers[division.key].all;
    const inTeamTarget = TEAMS_PER_DIVISION * PLAYERS_PER_TEAM;
    const teamUsers = divisionUsers.slice(0, inTeamTarget);
    const overflowUsers = divisionUsers.slice(inTeamTarget);
    const teamsPerGroup = TEAMS_PER_DIVISION / GROUPS_PER_DIVISION; // 4

    if (division.key === 'mixed') {
      const mixedMen = groupedUsers.mixed.men.slice(0, TEAMS_PER_DIVISION);
      const mixedWomen = groupedUsers.mixed.women.slice(0, TEAMS_PER_DIVISION);

      for (let teamIndex = 0; teamIndex < TEAMS_PER_DIVISION; teamIndex++) {
        const male = mixedMen[teamIndex];
        const female = mixedWomen[teamIndex];
        if (!male || !female) break;
        const playerIds = [male, female];
        teamPlayersByIndex.push(playerIds);
        teamDocs.push({
          tournamentId,
          name: `${division.label} Team ${String(teamIndex + 1).padStart(2, '0')}`,
          groupIndex: division.groupOffset + Math.floor(teamIndex / teamsPerGroup),
          playerIds,
          division: division.key,
          createdBy: male,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      for (let teamIndex = 0; teamIndex < TEAMS_PER_DIVISION; teamIndex++) {
        const start = teamIndex * PLAYERS_PER_TEAM;
        const playerIds = teamUsers.slice(start, start + PLAYERS_PER_TEAM);
        if (playerIds.length < PLAYERS_PER_TEAM) break;
        teamPlayersByIndex.push(playerIds);
        teamDocs.push({
          tournamentId,
          name: `${division.label} Team ${String(teamIndex + 1).padStart(2, '0')}`,
          groupIndex: division.groupOffset + Math.floor(teamIndex / teamsPerGroup),
          playerIds,
          division: division.key,
          createdBy: playerIds[0]!,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    waitingUserIds.push(...overflowUsers);
  }

  const teamsInsert = teamDocs.length ? await teams.insertMany(teamDocs) : null;
  const insertedTeamIds = teamDocs.map((_, i) => teamsInsert!.insertedIds[i]!.toString());
  const entryDocs = insertedTeamIds.flatMap((teamId, i) =>
    teamPlayersByIndex[i]!.map((playerId) => ({
      tournamentId,
      userId: playerId,
      teamId,
      lookingForPartner: false,
      status: 'in_team',
      createdAt: now,
      updatedAt: now,
    }))
  );
  if (entryDocs.length) {
    await entries.insertMany(entryDocs);
  }

  const teamPlayerIdsByTeamId = new Map<string, string[]>();
  const teamDivisionByTeamId = new Map<string, SeedDivision>();
  for (let i = 0; i < insertedTeamIds.length; i++) {
    const tid = insertedTeamIds[i]!;
    teamPlayerIdsByTeamId.set(tid, teamPlayersByIndex[i]!);
    teamDivisionByTeamId.set(tid, teamDocs[i]!.division);
  }
  const entryList = entryDocs.map((e) => ({ userId: e.userId, teamId: e.teamId }));

  // Seed waitlist: EXACTLY one row per user, for their seeded division.
  // This prevents stale/inconsistent states like "in a team in men" while still appearing in WL for mixed.
  const waitlistDocs = waitingUserIds.map((playerId) => {
    const idx = userIds.indexOf(playerId);
    const player = idx >= 0 ? PLAYERS[idx] : undefined;
    const division: SeedDivision = player?.division ?? 'mixed';
    const gender = player?.gender;
    if (gender !== 'male' && gender !== 'female') {
      throw new Error(`seedDevTournament invariant failed: user ${playerId} missing binary gender`);
    }
    if (division !== 'men' && division !== 'women' && division !== 'mixed') {
      throw new Error(`seedDevTournament invariant failed: user ${playerId} has invalid division "${String(division)}"`);
    }
    return {
      tournamentId,
      division,
      userId: playerId,
      createdAt: now,
      updatedAt: now,
    };
  });
  if (waitlistDocs.length) {
    await waitlist.insertMany(waitlistDocs);
  }
  // "Registered": explicit invariant check so we don't reintroduce multi-division WL bugs.
  {
    const byUser = new Map<string, SeedDivision[]>();
    for (const w of waitlistDocs) {
      const arr = byUser.get(w.userId) ?? [];
      arr.push(w.division);
      byUser.set(w.userId, arr);
    }
    for (const [uid, divs] of byUser) {
      if (divs.length !== 1) {
        throw new Error(
          `seedDevTournament invariant failed: waitlist must be 1 row per user. userId=${uid} divisions=${divs.join(',')}`
        );
      }
    }
  }

  // Seed assigns groupIndex directly; set this so DB matches tournaments that completed "Create groups."
  await tournaments.updateOne(
    { _id: tRes.insertedId },
    { $set: { groupsDistributedAt: now, updatedAt: now } }
  );

  // Start tournament → generate classification matches.
  await actionStartTournament(db, tournamentId, { matchesPerOpponent: 1 });

  // Mock all classification results so standings + category distribution are visible immediately.
  // Insert pending tournament bets (same deterministic outcome as the mock), complete matches, then settle.
  const matchesCol = db.collection('matches');
  const classificationMatches = await matchesCol
    .find({ tournamentId, stage: 'classification' })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const pointsToWin = 21;
  const now2 = new Date().toISOString();
  if (classificationMatches.length) {
    await ensureTournamentBetIndexes(db);
    const betsCol = db.collection('tournamentBets');
    const betDocs: Record<string, unknown>[] = [];
    const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
    for (const m of classificationMatches as unknown as {
      _id: ObjectId;
      teamAId: string;
      teamBId: string;
      division?: unknown;
    }[]) {
      const teamAId = String(m.teamAId ?? '');
      const teamBId = String(m.teamBId ?? '');
      const divRaw = String(m.division ?? '');
      const division: SeedDivision | null =
        divRaw === 'men' || divRaw === 'women' || divRaw === 'mixed' ? divRaw : null;
      const seed = hashStr(`${teamAId}-${teamBId}-${m._id.toString()}`);
      const aWins = seed % 2 === 0;
      const loserPts = Math.max(0, pointsToWin - 2 - (seed % 8));
      const pointsA = aWins ? pointsToWin : loserPts;
      const pointsB = aWins ? loserPts : pointsToWin;
      const winnerId = aWins ? teamAId : teamBId;
      const update: Record<string, unknown> = {
        status: 'completed',
        setsWonA: aWins ? 1 : 0,
        setsWonB: aWins ? 0 : 1,
        pointsA,
        pointsB,
        winnerId,
        completedAt: now2,
        updatedAt: now2,
      };
      ops.push({ updateOne: { filter: { _id: m._id }, update: { $set: update } } });

      if (division) {
        appendMockBetsForMatch(betDocs, {
          tournamentId,
          division,
          matchId: m._id.toString(),
          nowIso: now2,
          teamAId,
          teamBId,
          winnerId,
          pointsA,
          pointsB,
          pointsToWin,
          teamPlayerIdsByTeamId,
          teamDivisionByTeamId,
          entryList,
        });
      }
    }
    if (betDocs.length) await betsCol.insertMany(betDocs);
    if (ops.length) await matchesCol.bulkWrite(ops, { ordered: false });
    for (const m of classificationMatches) {
      await settleBetsForMatch(db, tournamentId, (m._id as ObjectId).toString());
    }
  }

  // Publish category phase matches based on those standings, then mock full bracket + bets.
  await actionPublishCategoryMatches(db, tournamentId);
  const now3 = new Date().toISOString();
  await seedCompleteCategoryBracketWithMockBets(
    db,
    tournamentId,
    now3,
    teamPlayerIdsByTeamId,
    teamDivisionByTeamId,
    entryList
  );

  const info = await getDevSeedInfo(db);

  return {
    ...info,
    alreadyExists: false,
    teamsCount: TEAMS_PER_DIVISION * divisionSpecs.length,
    entriesCount: entryDocs.length,
    waitlistCount: waitingUserIds.length,
  };
}
