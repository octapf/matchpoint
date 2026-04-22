import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { RALLY_POINTS_ABS_CAP } from '@/lib/matchRallyScoring';
import { shouldUseDevMocks } from '@/lib/config';
import { DEV_TOURNAMENT_ID, MOCK_DEV_CATEGORY_MATCHES } from '@/lib/mocks/devTournamentMocks';
import type { Match } from '@/types';

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

  let serveIndex = Number(m.serveIndex ?? 0);
  if (!Number.isFinite(serveIndex) || serveIndex < 0) serveIndex = 0;
  serveIndex = Math.floor(serveIndex) % 4;

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
  return useQuery({
    queryKey: ['matches', params],
    queryFn: () => {
      if (!params?.tournamentId) return Promise.resolve([] as Match[]);
      if (shouldUseDevMocks()) {
        if (params.tournamentId !== DEV_TOURNAMENT_ID) return Promise.resolve([] as Match[]);
        return Promise.resolve(MOCK_DEV_CATEGORY_MATCHES);
      }
      return tournamentsApi.findOneWithMatches(params.tournamentId).then((t) => {
        const raw = t as { matches?: unknown[] } | null;
        const all = Array.isArray(raw?.matches) ? (raw!.matches as Match[]) : ([] as Match[]);
        if (!params.stage && !params.division && !params.category && !params.groupIndex) return all;
        return all.filter((m) => {
          if (params.stage && (m as { stage?: string }).stage !== params.stage) return false;
          if (params.division && (m as { division?: string }).division !== params.division) return false;
          if (params.category && (m as { category?: string }).category !== params.category) return false;
          if (params.groupIndex && String((m as { groupIndex?: unknown }).groupIndex ?? '') !== params.groupIndex) return false;
          return true;
        });
      });
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
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function usePauseMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      tournamentsApi.action(tournamentId, { action: 'pauseMatch', matchId: id }) as Promise<Match>,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['matches'] });
      const snapshots = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
      const nowIso = new Date().toISOString();
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData<Match[]>(
          key,
          prev.map((m) => (m._id === vars.id ? ({ ...m, status: 'paused', pausedAt: nowIso, updatedAt: nowIso } as Match) : m))
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      for (const [key, data] of (ctx as any)?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
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
      queryClient.setQueriesData<Match[]>({ queryKey: ['matches'] }, (old) => {
        if (!old) return old;
        const idx = old.findIndex((m) => m._id === data._id);
        if (idx < 0) return old;
        const next = [...old];
        next[idx] = data;
        return next;
      });
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

