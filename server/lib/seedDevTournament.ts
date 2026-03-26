/**
 * Dev tournament seed: 16 users (Seed 1…16), one tournament, teams, entries.
 * Used by POST /api/admin and scripts/seed-dev-tournament.ts
 */
import type { Db } from 'mongodb';
import bcrypt from 'bcryptjs';

export const DEV_SEED_INVITE_LINK = 'seed-dev-beach-cup';
export const DEV_SEED_LOGIN_PASSWORD = 'SeedDev1!';

const EMAIL_RE = /^seed\.player\d{2}@matchpoint\.dev$/;

const PLAYERS = Array.from({ length: 16 }, (_, i) => ({
  firstName: 'Seed',
  lastName: String(i + 1),
  gender: i % 2 === 0 ? 'male' : 'female',
}));

const TEAM_SPECS: [string, ...number[]][] = [
  ['Team Alpha', 0, 1],
  ['Beach Kings', 2, 3],
  ['Sand Setters', 4, 5],
  ['Net Ninjas', 6, 7],
  ['Spike Squad', 8, 9],
  ['Need Partner A', 10],
  ['Need Partner B', 11],
];

const SOLO_LOOKING = [12, 13, 14, 15];

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
};

export type DevSeedPurgeResult = {
  removed: {
    tournament: boolean;
    teams: number;
    entries: number;
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

  const existing = await tournaments.findOne({ inviteLink: DEV_SEED_INVITE_LINK });
  let teamsDel = 0;
  let entriesDel = 0;
  let tournamentRemoved = false;

  if (existing) {
    const tid = existing._id.toString();
    const er = await entries.deleteMany({ tournamentId: tid });
    entriesDel = er.deletedCount ?? 0;
    const tr = await teams.deleteMany({ tournamentId: tid });
    teamsDel = tr.deletedCount ?? 0;
    await tournaments.deleteOne({ _id: existing._id });
    tournamentRemoved = true;
  }

  const ur = await users.deleteMany({ email: { $regex: EMAIL_RE } });
  const usersDel = ur.deletedCount ?? 0;

  return {
    removed: {
      tournament: tournamentRemoved,
      teams: teamsDel,
      entries: entriesDel,
      users: usersDel,
    },
  };
}

async function fetchSeedUsers(db: Db): Promise<DevSeedUserRow[]> {
  const docs = await db
    .collection('users')
    .find({ email: { $regex: EMAIL_RE } })
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

  const existing = await tournaments.findOne({ inviteLink: DEV_SEED_INVITE_LINK });

  if (existing && !options.force) {
    const info = await getDevSeedInfo(db);
    return {
      ...info,
      alreadyExists: true,
    };
  }

  await purgeDevSeed(db);

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(DEV_SEED_LOGIN_PASSWORD, 12);
  const userIds: string[] = [];

  for (let i = 0; i < PLAYERS.length; i++) {
    const n = String(i + 1).padStart(2, '0');
    const email = `seed.player${n}@matchpoint.dev`;
    const p = PLAYERS[i]!;
    const doc = {
      email: email.toLowerCase(),
      username: `seed_player${n}`,
      passwordHash,
      emailVerified: true,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: '',
      gender: p.gender,
      authProvider: 'email',
      createdAt: now,
      updatedAt: now,
    };
    const r = await users.insertOne(doc);
    userIds.push(r.insertedId.toString());
  }

  const organizerId = userIds[0]!;
  const tournamentDoc = {
    name: 'Summer Beach Cup (Seed)',
    date: '2026-07-15',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    location: 'Barceloneta Beach',
    description: 'Seeded data for tournament / team development.',
    maxTeams: 16,
    inviteLink: DEV_SEED_INVITE_LINK,
    status: 'open',
    organizerIds: [organizerId],
    createdAt: now,
    updatedAt: now,
  };
  const tRes = await tournaments.insertOne(tournamentDoc);
  const tournamentId = tRes.insertedId.toString();

  const teamIdByIndex: string[] = [];

  for (const spec of TEAM_SPECS) {
    const [name, ...playerIdxs] = spec;
    const playerIds = playerIdxs.map((idx) => userIds[idx]!);
    const createdBy = playerIds[0]!;
    const teamDoc = {
      tournamentId,
      name,
      playerIds,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const tr = await teams.insertOne(teamDoc);
    teamIdByIndex.push(tr.insertedId.toString());
  }

  for (let ti = 0; ti < TEAM_SPECS.length; ti++) {
    const spec = TEAM_SPECS[ti]!;
    const teamId = teamIdByIndex[ti]!;
    const [, ...playerIdxs] = spec;
    for (const idx of playerIdxs) {
      await entries.insertOne({
        tournamentId,
        userId: userIds[idx]!,
        teamId,
        lookingForPartner: false,
        status: 'in_team',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const idx of SOLO_LOOKING) {
    await entries.insertOne({
      tournamentId,
      userId: userIds[idx]!,
      teamId: null,
      lookingForPartner: true,
      status: 'joined',
      createdAt: now,
      updatedAt: now,
    });
  }

  const entryCount =
    TEAM_SPECS.reduce((acc, s) => acc + (s.length - 1), 0) + SOLO_LOOKING.length;
  const info = await getDevSeedInfo(db);

  return {
    ...info,
    alreadyExists: false,
    teamsCount: TEAM_SPECS.length,
    entriesCount: entryCount,
  };
}
