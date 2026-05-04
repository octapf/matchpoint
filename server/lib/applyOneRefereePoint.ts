import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { RALLY_POINTS_ABS_CAP } from '../../lib/matchRallyScoring';
import { normalizeMongoIdString } from '../../lib/mongoId';
import { settleBetsForMatch } from './tournamentBets';
import { assertTournamentAllowsLiveMatchActions } from './tournamentLivePlayGate';
import { notifyMany } from './notify';
import { buildDefaultServeOrder, serveSideAtIndex, validateServeOrderForTeams } from './serveOrder';

const REFEREE_LOCK_MS = 15_000;

function lockExpiresAtIso(nowMs: number): string {
  return new Date(nowMs + REFEREE_LOCK_MS).toISOString();
}

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  const next: Record<string, unknown> = {
    _id: _id instanceof ObjectId ? _id.toString() : _id,
  };
  for (const [k, v] of Object.entries(rest)) {
    if (v instanceof ObjectId) next[k] = v.toString();
    else next[k] = v;
  }
  return next;
}

function validMatchTeamIdsFromDoc(match: { teamAId?: unknown; teamBId?: unknown }): { teamAId: string; teamBId: string } | null {
  const teamAId = normalizeMongoIdString(match.teamAId);
  const teamBId = normalizeMongoIdString(match.teamBId);
  if (!teamAId || !teamBId || !ObjectId.isValid(teamAId) || !ObjectId.isValid(teamBId)) return null;
  return { teamAId, teamBId };
}

export type RefereePointOp = { side: 'A' | 'B'; delta: 1 | -1 };

export type ApplyOneRefereePointResult =
  | { ok: true; match: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * One `refereePoint` write (rate limit, serve, scoreEvents, optimistic concurrency).
 * Used by POST `refereePoint`.
 */
export async function applyOneRefereePoint(params: {
  db: Db;
  tournamentId: string;
  tournamentOid: ObjectId;
  matchId: string;
  actingUserId: string;
  actorIsAdmin: boolean;
  isOrg: boolean;
  side: 'A' | 'B';
  delta: 1 | -1;
  /** First step of a burst / single tap: enforce ~300ms `lastPointAt` spacing vs other HTTP clients. */
  enforceRateLimit: boolean;
}): Promise<ApplyOneRefereePointResult> {
  const { db, tournamentId, tournamentOid, matchId, actingUserId, actorIsAdmin, isOrg, side, delta, enforceRateLimit } = params;

  const matchOid = new ObjectId(matchId);
  const match = await db.collection('matches').findOne({ _id: matchOid });
  if (!match) return { ok: false, status: 404, body: { error: 'Match not found' } };
  if (String((match as { tournamentId?: unknown }).tournamentId ?? '') !== tournamentId) {
    return { ok: false, status: 400, body: { error: 'Match does not belong to this tournament' } };
  }

  const stage = String((match as { stage?: unknown }).stage ?? '');
  if (stage !== 'classification' && stage !== 'category') {
    return { ok: false, status: 400, body: { error: 'Invalid match stage' } };
  }

  const matchStatus = String((match as { status?: unknown }).status ?? 'scheduled');
  if (matchStatus !== 'in_progress') {
    return { ok: false, status: 400, body: { error: 'Match is not in progress' } };
  }

  const liveGatePoint = await assertTournamentAllowsLiveMatchActions(db, tournamentId);
  if (liveGatePoint) return { ok: false, status: liveGatePoint.status, body: { error: liveGatePoint.error } };

  const refereeUserId = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
  const nowMs = Date.now();
  const currentLockExp = String((match as { refereeLockExpiresAt?: unknown }).refereeLockExpiresAt ?? '');
  if (!actorIsAdmin && !isOrg && (!refereeUserId || refereeUserId !== actingUserId)) {
    return {
      ok: false,
      status: 409,
      body: {
        error: 'Referee changed',
        refereeUserId: refereeUserId || null,
        refereeLockExpiresAt: currentLockExp || null,
      },
    };
  }

  if (enforceRateLimit) {
    const lastPointAt = String((match as { lastPointAt?: unknown }).lastPointAt ?? '');
    if (lastPointAt) {
      const dt = Date.now() - Date.parse(lastPointAt);
      if (Number.isFinite(dt) && dt >= 0 && dt < 300) {
        return { ok: false, status: 429, body: { error: 'Too many score updates, slow down' } };
      }
    }
  }

  const idsRefPoint = validMatchTeamIdsFromDoc(match as { teamAId?: unknown; teamBId?: unknown });
  if (!idsRefPoint) {
    return { ok: false, status: 400, body: { error: 'Match teams are not ready' } };
  }
  const { teamAId, teamBId } = idsRefPoint;

  const [teamA, teamB] = await db
    .collection('teams')
    .find({ tournamentId: tournamentId, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
    .project({ _id: 1, playerIds: 1 })
    .toArray()
    .then((rows) => {
      const map = new Map<string, (typeof rows)[0]>();
      for (const r of rows as { _id?: unknown; playerIds?: unknown }[]) map.set(String(r._id), r);
      return [map.get(teamAId), map.get(teamBId)];
    });
  const playersA: string[] = Array.isArray(teamA?.playerIds) ? teamA.playerIds.map(String).filter(Boolean) : [];
  const playersB: string[] = Array.isArray(teamB?.playerIds) ? teamB.playerIds.map(String).filter(Boolean) : [];
  if (playersA.length < 1 || playersB.length < 1) {
    return { ok: false, status: 400, body: { error: 'Teams missing players' } };
  }

  const curA = Math.max(0, Number((match as { pointsA?: unknown }).pointsA ?? 0) || 0);
  const curB = Math.max(0, Number((match as { pointsB?: unknown }).pointsB ?? 0) || 0);
  const nextA = side === 'A' ? Math.max(0, curA + delta) : curA;
  const nextB = side === 'B' ? Math.max(0, curB + delta) : curB;

  if (delta === 1 && (nextA > RALLY_POINTS_ABS_CAP || nextB > RALLY_POINTS_ABS_CAP)) {
    return { ok: false, status: 400, body: { error: 'Score exceeds points limit' } };
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now, lastPointAt: now, pointsA: nextA, pointsB: nextB };
  update.refereeLockExpiresAt = lockExpiresAtIso(nowMs);
  if (actorIsAdmin || isOrg) {
    update.refereeUserId = actingUserId;
  }

  const existingOrder = Array.isArray((match as { serveOrder?: unknown }).serveOrder)
    ? ((match as { serveOrder?: unknown[] }).serveOrder as unknown[])
    : [];
  const candidateOrder = existingOrder.length === 4 ? existingOrder : buildDefaultServeOrder(playersA, playersB);
  const serveOrderValidation = validateServeOrderForTeams(candidateOrder, playersA, playersB);
  if (!serveOrderValidation.ok) {
    return { ok: false, status: 400, body: { error: serveOrderValidation.error } };
  }
  const order = serveOrderValidation.order;
  update.serveOrder = order;

  let serveIndex = Number((match as { serveIndex?: unknown }).serveIndex ?? 0);
  if (!Number.isFinite(serveIndex) || serveIndex < 0) serveIndex = 0;
  serveIndex = Math.floor(serveIndex) % 4;

  let serveIndexBeforeForEvent: number | undefined;

  if (delta === -1) {
    const events = Array.isArray((match as { scoreEvents?: unknown[] }).scoreEvents)
      ? ((match as { scoreEvents?: unknown[] }).scoreEvents as Record<string, unknown>[])
      : [];
    let restored: number | null = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e?.delta !== 1) continue;
      if (e.side !== side) continue;
      if (Number(e.pointsA) !== curA || Number(e.pointsB) !== curB) continue;
      const sib = e.serveIndexBefore;
      if (typeof sib === 'number' && Number.isFinite(sib)) {
        restored = Math.floor(sib) % 4;
        break;
      }
    }
    if (restored !== null) {
      serveIndex = restored;
    }
  } else if (delta === 1) {
    serveIndexBeforeForEvent = serveIndex;
    const servingSide = serveSideAtIndex(order, playersA, playersB, serveIndex);
    if (!servingSide) return { ok: false, status: 400, body: { error: 'Invalid serve order state' } };
    const scoringSide: 'A' | 'B' = side === 'A' ? 'A' : 'B';
    if (scoringSide !== servingSide) {
      serveIndex = (serveIndex + 1) % 4;
    }
  }

  const servingPlayerId = String(order[serveIndex] ?? order[0] ?? '');
  update.serveIndex = serveIndex;
  update.servingPlayerId = servingPlayerId;
  if (!(match as { startedAt?: unknown }).startedAt) update.startedAt = now;

  const event = {
    ts: now,
    userId: actingUserId,
    refereeTeamId: String((match as { refereeTeamId?: unknown }).refereeTeamId ?? '') || undefined,
    side,
    delta: delta as 1 | -1,
    pointsA: nextA,
    pointsB: nextB,
    ...(delta === 1 && typeof serveIndexBeforeForEvent === 'number' ? { serveIndexBefore: serveIndexBeforeForEvent } : {}),
  };
  if (!event.userId || (event.side !== 'A' && event.side !== 'B') || (event.delta !== 1 && event.delta !== -1)) {
    return { ok: false, status: 400, body: { error: 'Invalid score event' } };
  }

  const prevUpdatedAt = String((match as { updatedAt?: unknown }).updatedAt ?? '');
  const filter: Record<string, unknown> = prevUpdatedAt
    ? { _id: matchOid, updatedAt: prevUpdatedAt }
    : { _id: matchOid, $or: [{ updatedAt: { $exists: false } }, { updatedAt: '' }, { updatedAt: null }] };

  const result = await db.collection('matches').findOneAndUpdate(
    filter,
    {
      $set: update,
      $push: {
        scoreEvents: {
          $each: [event] as unknown[],
          $slice: -200,
        },
      },
    } as Record<string, unknown>,
    { returnDocument: 'after' }
  );
  if (!result) {
    console.log('[applyOneRefereePoint] concurrent_or_missing', { tournamentId, actingUserId, matchId });
    return { ok: false, status: 409, body: { error: 'Concurrent score update, retry' } };
  }

  if (update.status === 'completed') {
    const tdoc = await db.collection('tournaments').findOne({ _id: tournamentOid }, { projection: { name: 1 } });
    const ta = await db.collection('teams').findOne({ _id: new ObjectId(teamAId) }, { projection: { name: 1, playerIds: 1 } });
    const tb = await db.collection('teams').findOne({ _id: new ObjectId(teamBId) }, { projection: { name: 1, playerIds: 1 } });
    const taRow = ta as { playerIds?: unknown; name?: unknown } | null;
    const tbRow = tb as { playerIds?: unknown; name?: unknown } | null;
    const aPlayers: string[] = Array.isArray(taRow?.playerIds)
      ? (taRow.playerIds as unknown[]).map(String).filter(Boolean)
      : [];
    const bPlayers: string[] = Array.isArray(tbRow?.playerIds)
      ? (tbRow.playerIds as unknown[]).map(String).filter(Boolean)
      : [];
    const aName = String(taRow?.name ?? 'Team A');
    const bName = String(tbRow?.name ?? 'Team B');
    const winnerId = String((result as { winnerId?: unknown }).winnerId ?? '');
    const aResult = winnerId === teamAId ? 'W' : winnerId === teamBId ? 'L' : '';
    const bResult = winnerId === teamBId ? 'W' : winnerId === teamAId ? 'L' : '';
    await notifyMany(db, aPlayers, {
      type: 'match.ended',
      params: { opponent: bName, result: aResult || '-' },
      data: { tournamentId, matchId },
      dedupeKey: `match.ended:${matchId}`,
    });
    await notifyMany(db, bPlayers, {
      type: 'match.ended',
      params: { opponent: aName, result: bResult || '-' },
      data: { tournamentId, matchId },
      dedupeKey: `match.ended:${matchId}:b`,
    });
    void tdoc;
  }
  try {
    await settleBetsForMatch(db, tournamentId, matchId);
  } catch (betErr) {
    console.error('[applyOneRefereePoint] settleBetsForMatch', betErr);
  }

  const serialized = serializeDoc(result as Record<string, unknown>);
  if (!serialized) return { ok: false, status: 500, body: { error: 'Serialize failed' } };
  return { ok: true, match: serialized };
}
