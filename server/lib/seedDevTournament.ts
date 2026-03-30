/**
 * Dev tournament seed: 120 users (firstName Seed1…Seed120, lastName Bot), one tournament, teams, entries.
 * Used by POST /api/admin and scripts/seed-dev-tournament.ts
 */
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

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

  const existing = await tournaments.findOne({ inviteLink: DEV_SEED_INVITE_LINK });
  let teamsDel = 0;
  let entriesDel = 0;
  let waitlistDel = 0;
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
    const existingTidFilter = { tournamentId: { $in: [tournamentId, new ObjectId(tournamentId)] } };
    const [teamsCount, entriesCount, waitlistCount] = await Promise.all([
      teams.countDocuments(existingTidFilter),
      entries.countDocuments(existingTidFilter),
      waitlist.countDocuments(existingTidFilter),
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
    const isUpToDate =
      hasExpectedDivisions &&
      hasExpectedCategories &&
      maxTeams === SEEDED_TEAM_COUNT &&
      groupCount === expectedGroupCount &&
      teamsCount === SEEDED_TEAM_COUNT &&
      entriesCount === SEEDED_ENTRY_COUNT &&
      waitlistCount === SEEDED_WAITLIST_COUNT;
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
    location: 'Barceloneta Beach',
    description: 'Seeded data for tournament / team development.',
    // Keep divisions available for UI, but seed uses default total team config (16 teams, 4 groups).
    divisions: ['men', 'women', 'mixed'],
    categories: ['Gold', 'Silver', 'Bronze'] as string[],
    maxTeams: SEEDED_TEAM_COUNT,
    pointsToWin: 21,
    setsPerMatch: 1,
    groupCount: GROUPS_PER_DIVISION * 3,
    inviteLink: DEV_SEED_INVITE_LINK,
    status: 'open',
    organizerIds: [organizerId],
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
  const teamDocs: Array<{
    tournamentId: string;
    name: string;
    groupIndex: number;
    playerIds: string[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
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

  const waitlistDocs = waitingUserIds.map((playerId) => ({
    tournamentId,
    userId: playerId,
    createdAt: now,
    updatedAt: now,
  }));
  if (waitlistDocs.length) {
    await waitlist.insertMany(waitlistDocs);
  }
  const info = await getDevSeedInfo(db);

  return {
    ...info,
    alreadyExists: false,
    teamsCount: TEAMS_PER_DIVISION * divisionSpecs.length,
    entriesCount: entryDocs.length,
    waitlistCount: waitingUserIds.length,
  };
}
