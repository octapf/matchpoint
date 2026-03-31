import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import type { Match } from '@/types';

export function useMatches(params: { tournamentId: string; stage?: string; division?: string; category?: string; groupIndex?: string } | undefined) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: () => {
      if (!params?.tournamentId) return Promise.resolve([] as Match[]);
      if (shouldUseDevMocks()) return Promise.resolve([] as Match[]);
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
    enabled: !!params?.tournamentId,
    staleTime: 15_000,
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
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      tournamentsApi.action(tournamentId, { action: 'claimReferee', matchId: id }) as Promise<Match>,
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
    onSuccess: () => {
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
    retry: (failureCount, err: any) => {
      const status = typeof err?.status === 'number' ? err.status : typeof err?.response?.status === 'number' ? err.response.status : null;
      if (status === 409 && failureCount < 2) return true;
      return false;
    },
    retryDelay: (attempt) => 120 * attempt,
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

