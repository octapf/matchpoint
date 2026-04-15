import { ObjectId, type Db } from 'mongodb';
import type { TournamentDivision } from '../../types';

const COL = 'tournamentBets';

export type BetKind = 'winner' | 'score';

export interface TournamentBetDoc {
  _id?: ObjectId;
  tournamentId: string;
  division: TournamentDivision;
  matchId: string;
  userId: string;
  kind: BetKind;
  pickWinnerTeamId?: string;
  pickPointsA?: number;
  pickPointsB?: number;
  status: 'pending' | 'void' | 'settled';
  pointsAwarded: number;
  settledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

let indexesEnsured = false;

export async function ensureTournamentBetIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  const c = db.collection(COL);
  await c.createIndex({ tournamentId: 1, matchId: 1, userId: 1, kind: 1 }, { unique: true });
  await c.createIndex({ tournamentId: 1, division: 1 });
  await c.createIndex({ matchId: 1 });
  indexesEnsured = true;
}

function isDivision(d: string): d is TournamentDivision {
  return d === 'men' || d === 'women' || d === 'mixed';
}

/** Eligible: entry with team in same division as match. */
export async function assertBettingEligible(
  db: Db,
  tournamentId: string,
  userId: string,
  division: TournamentDivision
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = await db.collection('entries').findOne({
    tournamentId,
    userId,
    teamId: { $exists: true, $nin: [null, ''] },
  });
  if (!entry) {
    return { ok: false, error: 'You need a team entry in this tournament to bet' };
  }
  const teamId = String((entry as { teamId?: unknown }).teamId ?? '');
  if (!ObjectId.isValid(teamId)) return { ok: false, error: 'Invalid team entry' };
  const team = await db.collection('teams').findOne(
    { _id: new ObjectId(teamId), tournamentId },
    { projection: { division: 1 } }
  );
  const div = String((team as { division?: unknown } | null)?.division ?? '');
  if (div !== division) {
    return { ok: false, error: 'Your team is not in this division' };
  }
  return { ok: true };
}

export async function assertUserNotPlayingMatch(
  db: Db,
  tournamentId: string,
  userId: string,
  teamAId: string,
  teamBId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [a, b] = await db
    .collection('teams')
    .find({
      tournamentId,
      _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] },
    })
    .project({ playerIds: 1 })
    .toArray();
  const ids = new Set<string>();
  for (const t of [a, b]) {
    const pids = Array.isArray((t as { playerIds?: unknown })?.playerIds)
      ? ((t as { playerIds: string[] }).playerIds as string[])
      : [];
    for (const p of pids) ids.add(String(p));
  }
  if (ids.has(userId)) {
    return { ok: false, error: 'You cannot bet on a match you are playing in' };
  }
  return { ok: true };
}

function computePointsForUserBets(args: {
  winnerId: string;
  pointsA: number;
  pointsB: number;
  winnerBet?: { pickWinnerTeamId?: string } | null;
  scoreBet?: { pickPointsA?: number; pickPointsB?: number } | null;
}): { winnerPts: number; scorePts: number } {
  const { winnerId, pointsA, pointsB } = args;
  const scoreBet = args.scoreBet;
  const scoreExact =
    scoreBet != null &&
    Number.isFinite(Number(scoreBet.pickPointsA)) &&
    Number.isFinite(Number(scoreBet.pickPointsB)) &&
    Math.floor(Number(scoreBet.pickPointsA)) === pointsA &&
    Math.floor(Number(scoreBet.pickPointsB)) === pointsB;

  if (scoreExact) {
    return { winnerPts: 0, scorePts: 7 };
  }
  const wPick = String(args.winnerBet?.pickWinnerTeamId ?? '');
  const winnerPts = wPick && wPick === winnerId ? 2 : 0;
  return { winnerPts, scorePts: 0 };
}

/**
 * Recompute settlement for all bets on this match (completed → points; else → void).
 */
export async function settleBetsForMatch(db: Db, tournamentId: string, matchId: string): Promise<void> {
  await ensureTournamentBetIndexes(db);
  if (!ObjectId.isValid(matchId)) return;
  const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
  if (!match || String((match as { tournamentId?: unknown }).tournamentId ?? '') !== tournamentId) return;

  const status = String((match as { status?: unknown }).status ?? '');
  const now = new Date().toISOString();
  const c = db.collection(COL);

  const bets = (await c.find({ tournamentId, matchId }).toArray()) as unknown as TournamentBetDoc[];
  if (bets.length === 0) return;

  if (status !== 'completed') {
    await c.updateMany(
      { tournamentId, matchId },
      { $set: { status: 'void', pointsAwarded: 0, settledAt: now, updatedAt: now } }
    );
    return;
  }

  const winnerId = String((match as { winnerId?: unknown }).winnerId ?? '');
  const pointsA = Math.max(0, Math.floor(Number((match as { pointsA?: unknown }).pointsA ?? 0) || 0));
  const pointsB = Math.max(0, Math.floor(Number((match as { pointsB?: unknown }).pointsB ?? 0) || 0));

  if (!winnerId) {
    await c.updateMany(
      { tournamentId, matchId },
      { $set: { status: 'void', pointsAwarded: 0, settledAt: now, updatedAt: now } }
    );
    return;
  }

  const byUser = new Map<string, TournamentBetDoc[]>();
  for (const b of bets) {
    const uid = String(b.userId);
    const list = byUser.get(uid) ?? [];
    list.push(b);
    byUser.set(uid, list);
  }

  for (const [, list] of byUser) {
    const winnerBet = list.find((x) => x.kind === 'winner') ?? null;
    const scoreBet = list.find((x) => x.kind === 'score') ?? null;
    const { winnerPts, scorePts } = computePointsForUserBets({
      winnerId,
      pointsA,
      pointsB,
      winnerBet,
      scoreBet,
    });

    for (const b of list) {
      let pts = 0;
      if (b.kind === 'winner') pts = winnerPts;
      else if (b.kind === 'score') pts = scorePts;
      await c.updateOne(
        { _id: b._id },
        { $set: { status: 'settled', pointsAwarded: pts, settledAt: now, updatedAt: now } }
      );
    }
  }
}

export async function placeTournamentBet(
  db: Db,
  args: {
    tournamentId: string;
    actingUserId: string;
    matchId: string;
    kind: BetKind;
    pickWinnerTeamId?: string;
    pickPointsA?: number;
    pickPointsB?: number;
  }
): Promise<{ ok: true; bet: Record<string, unknown> } | { ok: false; error: string; code?: number }> {
  await ensureTournamentBetIndexes(db);
  const { tournamentId, actingUserId, matchId, kind } = args;

  if (!ObjectId.isValid(matchId)) return { ok: false, error: 'Invalid matchId' };

  const tdoc = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
  if (!tdoc) return { ok: false, error: 'Tournament not found' };
  const bettingEnabled = !!(tdoc as { bettingEnabled?: unknown }).bettingEnabled;
  const allowWinner = !!(tdoc as { bettingAllowWinner?: unknown }).bettingAllowWinner;
  const allowScore = !!(tdoc as { bettingAllowScore?: unknown }).bettingAllowScore;
  if (!bettingEnabled) return { ok: false, error: 'Betting is disabled for this tournament' };
  if (kind === 'winner' && !allowWinner) return { ok: false, error: 'Winner bets are disabled' };
  if (kind === 'score' && !allowScore) return { ok: false, error: 'Score bets are disabled' };

  const match = await db.collection('matches').findOne({ _id: new ObjectId(matchId) });
  if (!match || String((match as { tournamentId?: unknown }).tournamentId ?? '') !== tournamentId) {
    return { ok: false, error: 'Match not found' };
  }
  const mstatus = String((match as { status?: unknown }).status ?? 'scheduled');
  if (mstatus !== 'scheduled') {
    return { ok: false, error: 'Betting is closed for this match' };
  }

  const division = String((match as { division?: unknown }).division ?? '');
  if (!isDivision(division)) return { ok: false, error: 'Match division is missing' };

  const teamAId = String((match as { teamAId?: unknown }).teamAId ?? '');
  const teamBId = String((match as { teamBId?: unknown }).teamBId ?? '');
  if (!ObjectId.isValid(teamAId) || !ObjectId.isValid(teamBId)) {
    return { ok: false, error: 'Match teams are not ready yet' };
  }

  const elig = await assertBettingEligible(db, tournamentId, actingUserId, division);
  if (!elig.ok) return { ok: false, error: elig.error };

  const notPlaying = await assertUserNotPlayingMatch(db, tournamentId, actingUserId, teamAId, teamBId);
  if (!notPlaying.ok) return { ok: false, error: notPlaying.error };

  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    tournamentId,
    division,
    matchId,
    userId: actingUserId,
    kind,
    status: 'pending',
    pointsAwarded: 0,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (kind === 'winner') {
    const pick = typeof args.pickWinnerTeamId === 'string' ? args.pickWinnerTeamId.trim() : '';
    if (pick !== teamAId && pick !== teamBId) {
      return { ok: false, error: 'Pick a valid team' };
    }
    doc.pickWinnerTeamId = pick;
  } else {
    const pa = args.pickPointsA != null ? Math.floor(Number(args.pickPointsA)) : NaN;
    const pb = args.pickPointsB != null ? Math.floor(Number(args.pickPointsB)) : NaN;
    if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa < 0 || pb < 0) {
      return { ok: false, error: 'Invalid score prediction' };
    }
    doc.pickPointsA = pa;
    doc.pickPointsB = pb;
  }

  try {
    const r = await db.collection(COL).insertOne(doc);
    const inserted = await db.collection(COL).findOne({ _id: r.insertedId });
    return { ok: true, bet: inserted as Record<string, unknown> };
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: number }).code : undefined;
    if (code === 11000) {
      return { ok: false, error: 'You already placed this bet', code: 409 };
    }
    return { ok: false, error: 'Could not place bet' };
  }
}

export async function buildBettingSnapshot(
  db: Db,
  tournamentId: string,
  division: TournamentDivision,
  viewerIsOrganizer: boolean
): Promise<{
  bettingEnabled: boolean;
  bettingAllowWinner: boolean;
  bettingAllowScore: boolean;
  bettingAnonymous: boolean;
  leaderboard: { userId: string; points: number; exactHits: number }[];
  matches: Array<{
    matchId: string;
    teamAId: string;
    teamBId: string;
    teamAName: string;
    teamBName: string;
    status: string;
    winnerPctA: number | null;
    winnerPctB: number | null;
    winnerCountA: number;
    winnerCountB: number;
    lines: Array<{
      userId: string;
      kind: BetKind;
      pickWinnerTeamId?: string;
      pickPointsA?: number;
      pickPointsB?: number;
      pointsAwarded?: number;
      status?: string;
    }> | null;
  }>;
}> {
  await ensureTournamentBetIndexes(db);
  const tdoc = await db.collection('tournaments').findOne({ _id: new ObjectId(tournamentId) });
  const bettingEnabled = !!(tdoc as { bettingEnabled?: unknown } | null)?.bettingEnabled;
  const bettingAllowWinner = !!(tdoc as { bettingAllowWinner?: unknown } | null)?.bettingAllowWinner;
  const bettingAllowScore = !!(tdoc as { bettingAllowScore?: unknown } | null)?.bettingAllowScore;
  const bettingAnonymous = !!(tdoc as { bettingAnonymous?: unknown } | null)?.bettingAnonymous;

  const matches = (await db
    .collection('matches')
    .find({ tournamentId, division })
    .project({
      _id: 1,
      teamAId: 1,
      teamBId: 1,
      status: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()) as Array<{
    _id: ObjectId;
    teamAId?: unknown;
    teamBId?: unknown;
    status?: unknown;
  }>;

  const teamIds = new Set<string>();
  for (const m of matches) {
    const a = String(m.teamAId ?? '');
    const b = String(m.teamBId ?? '');
    if (ObjectId.isValid(a)) teamIds.add(a);
    if (ObjectId.isValid(b)) teamIds.add(b);
  }
  const teams = await db
    .collection('teams')
    .find({ tournamentId, _id: { $in: [...teamIds].map((id) => new ObjectId(id)) } })
    .project({ name: 1 })
    .toArray();
  const teamName = new Map<string, string>();
  for (const tm of teams) {
    teamName.set(String(tm._id), String((tm as { name?: unknown }).name ?? ''));
  }

  const allBets = (await db
    .collection(COL)
    .find({ tournamentId, division })
    .toArray()) as unknown as TournamentBetDoc[];

  const pointsByUser = new Map<string, number>();
  const exactByUser = new Map<string, number>();
  for (const b of allBets) {
    if (b.status !== 'settled') continue;
    const uid = String(b.userId);
    pointsByUser.set(uid, (pointsByUser.get(uid) ?? 0) + (Number(b.pointsAwarded) || 0));
    if (b.kind === 'score' && (b.pointsAwarded ?? 0) > 0) {
      exactByUser.set(uid, (exactByUser.get(uid) ?? 0) + 1);
    }
  }

  const bettorIds = new Set(allBets.map((b) => String(b.userId)));
  const leaderboard = [...bettorIds]
    .map((userId) => ({
      userId,
      points: pointsByUser.get(userId) ?? 0,
      exactHits: exactByUser.get(userId) ?? 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      return a.userId.localeCompare(b.userId);
    });

  const betsByMatch = new Map<string, TournamentBetDoc[]>();
  for (const b of allBets) {
    const mid = String(b.matchId);
    const arr = betsByMatch.get(mid) ?? [];
    arr.push(b);
    betsByMatch.set(mid, arr);
  }

  const matchRows = matches.map((m) => {
    const matchId = m._id.toString();
    const teamAId = String(m.teamAId ?? '');
    const teamBId = String(m.teamBId ?? '');
    const status = String(m.status ?? 'scheduled');
    const list = betsByMatch.get(matchId) ?? [];

    const winnerBets = list.filter((x) => x.kind === 'winner');
    let na = 0;
    let nb = 0;
    for (const w of winnerBets) {
      const p = String(w.pickWinnerTeamId ?? '');
      if (p === teamAId) na += 1;
      else if (p === teamBId) nb += 1;
    }
    const denom = na + nb;
    const winnerPctA = denom > 0 ? na / denom : null;
    const winnerPctB = denom > 0 ? nb / denom : null;

    const revealPost = status === 'completed';
    const revealPublicLive = !bettingAnonymous;
    const showLines = viewerIsOrganizer || revealPost || (status === 'in_progress' && revealPublicLive);

    const lines = (list ?? []).map((b) => ({
      userId: String(b.userId),
      kind: b.kind,
      pickWinnerTeamId: b.pickWinnerTeamId,
      pickPointsA: b.pickPointsA,
      pickPointsB: b.pickPointsB,
      pointsAwarded: b.pointsAwarded,
      status: b.status,
    }));

    return {
      matchId,
      teamAId,
      teamBId,
      teamAName: teamName.get(teamAId) || 'A',
      teamBName: teamName.get(teamBId) || 'B',
      status,
      winnerPctA,
      winnerPctB,
      winnerCountA: na,
      winnerCountB: nb,
      lines: showLines ? lines : null,
    };
  });

  return {
    bettingEnabled,
    bettingAllowWinner,
    bettingAllowScore,
    bettingAnonymous,
    leaderboard,
    matches: matchRows,
  };
}
