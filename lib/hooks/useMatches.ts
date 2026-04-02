import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { DEV_TOURNAMENT_ID, MOCK_DEV_CATEGORY_MATCHES } from '@/lib/mocks/devTournamentMocks';
import type { Match } from '@/types';

/**
 * Mirrors `api/tournaments/[id].ts` `refereePoint` serve logic: on +1, advance global
 * `serveIndex` only when the receiving team wins the rally (side-out). On −1 the server
 * does not move serve — same here so optimistic rollback matches server state.
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
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
    onMutate: async (vars) => {
      // Optimistic update: patch any cached match lists.
      await queryClient.cancelQueries({ queryKey: ['matches'] });
      const snapshots = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData<Match[]>(
          key,
          prev.map((m) => {
            if (m._id !== vars.id) return m;
            const curA = Number(m.pointsA ?? 0) || 0;
            const curB = Number(m.pointsB ?? 0) || 0;
            const nextA = vars.side === 'A' ? Math.max(0, curA + vars.delta) : curA;
            const nextB = vars.side === 'B' ? Math.max(0, curB + vars.delta) : curB;
            const pts = Math.max(1, Math.min(99, Number(m.pointsToWin ?? 21) || 21));
            if (vars.delta === 1 && (nextA > pts || nextB > pts)) {
              return m;
            }
            const servePatch = computeOptimisticServeAfterRefereePoint(m, vars.side, vars.delta);
            return {
              ...m,
              pointsA: nextA,
              pointsB: nextB,
              updatedAt: new Date().toISOString(),
              ...(servePatch ? { serveIndex: servePatch.serveIndex, servingPlayerId: servePatch.servingPlayerId } : {}),
            } as Match;
          })
        );
      }
      return { snapshots };
    },
    retry: (failureCount, err: any) => {
      const status = typeof err?.status === 'number' ? err.status : typeof err?.response?.status === 'number' ? err.response.status : null;
      if (status === 409 && failureCount < 2) return true;
      return false;
    },
    retryDelay: (attempt) => 120 * attempt,
    onError: (_err, _vars, ctx) => {
      // rollback optimistic cache
      for (const [key, data] of (ctx as any)?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
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

