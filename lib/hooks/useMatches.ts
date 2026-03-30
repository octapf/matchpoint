import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { matchesApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import type { Match } from '@/types';

export function useMatches(params: { tournamentId: string; stage?: string; division?: string; category?: string; groupIndex?: string } | undefined) {
  return useQuery({
    queryKey: ['matches', params],
    queryFn: () => {
      if (!params?.tournamentId) return Promise.resolve([] as Match[]);
      if (shouldUseDevMocks()) return Promise.resolve([] as Match[]);
      return matchesApi.find(params) as Promise<Match[]>;
    },
    enabled: !!params?.tournamentId,
    staleTime: 15_000,
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: Record<string, unknown> }) =>
      matchesApi.updateOne(id, update) as Promise<Match>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match', data._id] });
    },
  });
}

