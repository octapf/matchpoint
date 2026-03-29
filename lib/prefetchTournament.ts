import type { QueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import type { Tournament } from '@/types';

/** Warm tournament detail cache when user focuses a list row (tap / press-in). */
export function prefetchTournament(queryClient: QueryClient, id: string | undefined): void {
  if (!id?.trim() || shouldUseDevMocks()) return;
  void queryClient.prefetchQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentsApi.findOne(id) as Promise<Tournament>,
    staleTime: 45_000,
  });
}
