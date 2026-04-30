import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { RALLY_POINTS_ABS_CAP } from '@/lib/matchRallyScoring';
import { shouldUseDevMocks } from '@/lib/config';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { DEV_TOURNAMENT_ID, MOCK_DEV_CATEGORY_MATCHES } from '@/lib/mocks/devTournamentMocks';
import type { Match } from '@/types';

/**
 * Late `refereePoint` / `setServeOrder` responses can resolve after `updateMatch` finalize already set the match
 * to `completed` in cache. Applying those snapshots would briefly show the match as in progress again.
 */
function shouldRejectStaleMatchMerge(prev: Match | undefined, incoming: Match): boolean {
  const prevStatus = String((prev as { status?: unknown })?.status ?? '');
  const incomingStatus = String((incoming as { status?: unknown })?.status ?? '');
  return prevStatus === 'completed' && incomingStatus === 'in_progress';
}

function upsertMatchFromServer(queryClient: QueryClient, data: Match): void {
  queryClient.setQueriesData<Match[]>({ queryKey: ['matches'] }, (old) => {
    if (!old) return old;
    const idx = old.findIndex((m) => m._id === data._id);
    if (idx < 0) return old;
    if (shouldRejectStaleMatchMerge(old[idx], data)) return old;
    const next = [...old];
    next[idx] = data;
    return next;
  });
}

/**
 * Full list refetches (invalidateQueries, window focus, etc.) can return rows before finalize is committed,
 * briefly showing `in_progress` again while cache already has optimistic `completed`.
 */
function mergeFreshMatchesWithCache(prev: Match[] | undefined, fresh: Match[]): Match[] {
  if (!prev?.length) return fresh;
  const prevById = new Map(prev.map((m) => [String(m._id), m]));
  return fresh.map((m) => {
    const p = prevById.get(String(m._id));
    if (p && shouldRejectStaleMatchMerge(p, m)) return p;
    return m;
  });
}

/**
 * Find the +1 event that produced the current score (curA, curB) when `side` scored;
 * `serveIndexBefore` was stored on new events for undo (see API `refereePoint`).
 */
function findServeIndexBeforeForUndo(m: Match, side: 'A' | 'B', curA: number, curB: number): number | null {
  const events = m.scoreEvents;
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as {
      delta?: unknown;
      side?: unknown;
      pointsA?: unknown;
      pointsB?: unknown;
      serveIndexBefore?: unknown;
    };
    if (Number(e.delta) !== 1) continue;
    if (e.side !== side) continue;
    if (Number(e.pointsA) !== curA || Number(e.pointsB) !== curB) continue;
    const sib = e.serveIndexBefore;
    if (typeof sib === 'number' && Number.isFinite(sib)) {
      return Math.floor(sib) % 4;
    }
  }
  return null;
}

/**
 * Mirrors `api/tournaments/[id].ts` `refereePoint` serve logic: on +1, advance global
 * `serveIndex` only when the receiving team wins the rally (side-out). On −1, serve is
 * restored via `scoreEvents[].serveIndexBefore` when present (same as API).
 */
function computeOptimisticServeAfterRefereePoint(
  m: Match,
  side: 'A' | 'B',
  delta: 1 | -1
): { serveIndex: number; servingPlayerId: string } | null {
  const order = Array.isArray(m.serveOrder) ? m.serveOrder.map(String).filter(Boolean) : [];
  if (order.length !== 4) return null;

  // Derive the current serve index from `servingPlayerId` when present.
  // This keeps optimistic serve progression consistent when the referee manually assigns the server.
  const servingRaw = typeof (m as { servingPlayerId?: unknown }).servingPlayerId === 'string' ? String(m.servingPlayerId) : '';
  const idxFromServing = servingRaw ? order.findIndex((p) => p === servingRaw) : -1;
  let serveIndex =
    idxFromServing >= 0
      ? idxFromServing
      : (() => {
          let si = Number(m.serveIndex ?? 0);
          if (!Number.isFinite(si) || si < 0) si = 0;
          return Math.floor(si) % 4;
        })();

  if (delta === 1) {
    const servingSide: 'A' | 'B' = serveIndex % 2 === 0 ? 'A' : 'B';
    const scoringSide: 'A' | 'B' = side;
    if (scoringSide !== servingSide) {
      serveIndex = (serveIndex + 1) % 4;
    }
  }

  const servingPlayerId = String(order[serveIndex] ?? order[0] ?? '');
  return { serveIndex, servingPlayerId };
}

/**
 * Pure “what-if” one referee tap — used to derive UI from server match + pending ops queue.
 * Returns null if the delta is invalid (e.g. would exceed the absolute rally cap on +1).
 */
export function applyRefereeDeltaToMatch(m: Match, side: 'A' | 'B', delta: 1 | -1): Match | null {
  const curA = Number(m.pointsA ?? 0) || 0;
  const curB = Number(m.pointsB ?? 0) || 0;
  const nextA = side === 'A' ? Math.max(0, curA + delta) : curA;
  const nextB = side === 'B' ? Math.max(0, curB + delta) : curB;
  if (delta === 1 && (nextA > RALLY_POINTS_ABS_CAP || nextB > RALLY_POINTS_ABS_CAP)) {
    return null;
  }
  if (delta === -1) {
    const restored = findServeIndexBeforeForUndo(m, side, curA, curB);
    const order = Array.isArray(m.serveOrder) ? m.serveOrder.map(String).filter(Boolean) : [];
    if (restored !== null && order.length === 4) {
      const si = restored;
      const servingPlayerId = String(order[si] ?? order[0] ?? '');
      return {
        ...m,
        pointsA: nextA,
        pointsB: nextB,
        serveIndex: si,
        servingPlayerId,
      } as Match;
    }
    return {
      ...m,
      pointsA: nextA,
      pointsB: nextB,
    } as Match;
  }
  const servePatch = computeOptimisticServeAfterRefereePoint(m, side, delta);
  return {
    ...m,
    pointsA: nextA,
    pointsB: nextB,
    ...(servePatch ? { serveIndex: servePatch.serveIndex, servingPlayerId: servePatch.servingPlayerId } : {}),
  } as Match;
}

export function useMatches(
  params: { tournamentId: string; stage?: string; division?: string; category?: string; groupIndex?: string } | undefined,
  options?: { enabled?: boolean; refetchIntervalMs?: number }
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['matches', params],
    queryFn: async () => {
      if (!params?.tournamentId) return [] as Match[];
      const cacheKey = ['matches', params] as const;
      const prev = queryClient.getQueryData<Match[]>(cacheKey);

      if (shouldUseDevMocks()) {
        if (params.tournamentId !== DEV_TOURNAMENT_ID) return [] as Match[];
        return mergeFreshMatchesWithCache(prev, MOCK_DEV_CATEGORY_MATCHES);
      }

      const t = await tournamentsApi.findOneWithMatches(params.tournamentId);
      const raw = t as { matches?: unknown[] } | null;
      let all = Array.isArray(raw?.matches) ? (raw!.matches as Match[]) : ([] as Match[]);
      if (params.stage || params.division || params.category || params.groupIndex) {
        all = all.filter((m) => {
          if (params.stage && (m as { stage?: string }).stage !== params.stage) return false;
          if (params.division && (m as { division?: string }).division !== params.division) return false;
          if (params.category && (m as { category?: string }).category !== params.category) return false;
          if (params.groupIndex && String((m as { groupIndex?: unknown }).groupIndex ?? '') !== params.groupIndex) return false;
          return true;
        });
      }
      return mergeFreshMatchesWithCache(prev, all);
    },
    enabled: options?.enabled ?? !!params?.tournamentId,
    staleTime: 15_000,
    ...(options?.refetchIntervalMs ? { refetchInterval: options.refetchIntervalMs } : null),
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId, update }: { id: string; tournamentId: string; update: Record<string, unknown> }) =>
      tournamentsApi.action(tournamentId, { action: 'updateMatch', matchId: id, ...update }) as Promise<Match>,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['matches'] });
      const snapshots = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
      const nowIso = new Date().toISOString();
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData<Match[]>(
          key,
          prev.map((m) => {
            if (m._id !== vars.id) return m;
            const u = vars.update || {};
            const next: any = { ...m, updatedAt: nowIso };
            if (typeof u.pointsA === 'number') next.pointsA = Math.max(0, Math.floor(u.pointsA));
            if (typeof u.pointsB === 'number') next.pointsB = Math.max(0, Math.floor(u.pointsB));
            if (typeof u.setsWonA === 'number') next.setsWonA = Math.max(0, Math.floor(u.setsWonA));
            if (typeof u.setsWonB === 'number') next.setsWonB = Math.max(0, Math.floor(u.setsWonB));
            // When we're saving an edited completed result we pass finalize:true; mirror API finalize rules
            // so winner styling / sets row update immediately (not only after server roundtrip).
            if (u.finalize === true) {
              const pa = Math.max(0, Math.floor(Number(next.pointsA ?? 0) || 0));
              const pb = Math.max(0, Math.floor(Number(next.pointsB ?? 0) || 0));
              const teamAId = normalizeMongoIdString((m as { teamAId?: unknown }).teamAId);
              const teamBId = normalizeMongoIdString((m as { teamBId?: unknown }).teamBId);
              const winnerId = pa === pb ? null : pa > pb ? teamAId : teamBId;
              next.winnerId = winnerId;
              next.setsWonA = winnerId && winnerId === teamAId ? 1 : 0;
              next.setsWonB = winnerId && winnerId === teamBId ? 1 : 0;
              next.status = 'completed';
              next.completedAt = nowIso;
            }
            return next as Match;
          })
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of (ctx as any)?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data) => {
      upsertMatchFromServer(queryClient, data);
    },
  });
}

export function useClaimReferee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId, mode }: { id: string; tournamentId: string; mode?: 'claim' | 'takeover' }) =>
      tournamentsApi.action(tournamentId, { action: 'claimReferee', matchId: id, ...(mode ? { mode } : null) }) as Promise<Match>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useRefereeHeartbeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      tournamentsApi.action(tournamentId, { action: 'refereeHeartbeat', matchId: id }) as Promise<Match>,
    /** Do not invalidate — refetch would overwrite live score with stale DB while taps are in flight. */
    onSuccess: (data) => {
      queryClient.setQueriesData<Match[]>({ queryKey: ['matches'] }, (old) => {
        if (!old) return old;
        return old.map((m) =>
          m._id === data._id
            ? ({
                ...m,
                refereeLockExpiresAt: (data as Match).refereeLockExpiresAt,
                updatedAt: (data as Match).updatedAt,
                refereeUserId: (data as Match).refereeUserId ?? m.refereeUserId,
              } as Match)
            : m
        );
      });
    },
  });
}

export function useStartMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      tournamentsApi.action(tournamentId, { action: 'startMatch', matchId: id }) as Promise<Match>,
    onMutate: async (vars) => {
      // Optimistic: flip status so UI enters "live" immediately (volleyball icon + timer).
      await queryClient.cancelQueries({ queryKey: ['matches'] });
      const snapshots = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
      const nowIso = new Date().toISOString();
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData<Match[]>(
          key,
          prev.map((m) => {
            if (m._id !== vars.id) return m;
            const cur = m as any;
            // Only optimistic-start when the match is truly scheduled. If a stray/late call happens,
            // do NOT flip paused/in_progress and make the clock jump.
            const curStatus = String(cur.status ?? '');
            if (curStatus !== 'scheduled') return m;
            const serveOrder = Array.isArray(cur.serveOrder) ? cur.serveOrder : undefined;
            const optimisticServing =
              typeof cur.servingPlayerId === 'string' && cur.servingPlayerId ? cur.servingPlayerId : Array.isArray(serveOrder) ? serveOrder[0] : undefined;
            return {
              ...m,
              status: 'in_progress',
              startedAt: cur.startedAt ?? nowIso,
              ...(optimisticServing ? { servingPlayerId: optimisticServing } : null),
              updatedAt: nowIso,
            } as Match;
          })
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of (ctx as any)?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data) => {
      upsertMatchFromServer(queryClient, data);
    },
    retry: 0,
  });
}

export function useRefereePoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tournamentId,
      side,
      delta,
    }: {
      id: string;
      tournamentId: string;
      side: 'A' | 'B';
      delta: 1 | -1;
    }) =>
      tournamentsApi.action(tournamentId, {
        action: 'refereePoint',
        matchId: id,
        side,
        delta,
      }) as Promise<Match>,
    /**
     * No onMutate: UI derives score from server match + pending-ops queue on the match screen.
     * Each success applies authoritative server state in order (FIFO queue).
     */
    retry: (failureCount, err: any) => {
      const status = typeof err?.status === 'number' ? err.status : typeof err?.response?.status === 'number' ? err.response.status : null;
      if (status === 429 && failureCount < 8) return true;
      if (status === 409 && failureCount < 2) return true;
      return false;
    },
    retryDelay: (attemptIndex) => (attemptIndex === 0 ? 360 : 120 * attemptIndex),
    onSuccess: (data) => {
      upsertMatchFromServer(queryClient, data);
    },
  });
}

export function useRefereePointsBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tournamentId,
      ops,
      clientMutationId,
    }: {
      id: string;
      tournamentId: string;
      ops: { side: 'A' | 'B'; delta: 1 | -1 }[];
      clientMutationId: string;
    }) =>
      tournamentsApi.action(tournamentId, {
        action: 'refereePointsBatch',
        matchId: id,
        ops,
        clientMutationId,
      }) as Promise<Match>,
    /**
     * No onMutate: matchdetail uses a local pending-ops queue to render instantly.
     * We only upsert the authoritative server state when the batch resolves.
     */
    retry: (failureCount, err: any) => {
      const status = typeof err?.status === 'number' ? err.status : typeof err?.response?.status === 'number' ? err.response.status : null;
      if (status === 409 && failureCount < 2) return true;
      if (status === 429 && failureCount < 2) return true;
      return false;
    },
    retryDelay: (attemptIndex) => (attemptIndex === 0 ? 240 : 120 * attemptIndex),
    onSuccess: (data) => {
      upsertMatchFromServer(queryClient, data);
    },
  });
}

export function useSetServeOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tournamentId,
      order,
      servingPlayerId,
    }: {
      id: string;
      tournamentId: string;
      order: string[];
      servingPlayerId?: string;
    }) =>
      tournamentsApi.action(tournamentId, {
        action: 'setServeOrder',
        matchId: id,
        order,
        ...(servingPlayerId ? { servingPlayerId } : null),
      }) as Promise<Match>,
    onMutate: async (vars) => {
      // Optimistic: update serve order + serving player so the icon/order react instantly.
      await queryClient.cancelQueries({ queryKey: ['matches'] });
      const snapshots = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
      const nowIso = new Date().toISOString();
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData<Match[]>(
          key,
          prev.map((m) => {
            if (m._id !== vars.id) return m;
            const nextServing =
              typeof vars.servingPlayerId === 'string' && vars.servingPlayerId
                ? vars.servingPlayerId
                : Array.isArray(vars.order) && vars.order.length > 0
                  ? vars.order[0]
                  : (m as any).servingPlayerId;
            return {
              ...m,
              serveOrder: vars.order,
              ...(nextServing ? { servingPlayerId: nextServing } : null),
              updatedAt: nowIso,
            } as Match;
          })
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of (ctx as any)?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data) => {
      upsertMatchFromServer(queryClient, data);
    },
  });
}

