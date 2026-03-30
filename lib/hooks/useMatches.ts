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

