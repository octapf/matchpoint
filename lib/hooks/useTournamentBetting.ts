import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { getMockDevBettingSnapshot } from '@/lib/mocks/devTournamentMocks';
import { augmentBettingSnapshotWithLinePicks } from '@/lib/utils/bettingSnapshotClient';
import type { Tournament, TournamentDivision } from '@/types';

export function useTournamentBetting(
  tournamentId: string | undefined,
  division: TournamentDivision | undefined,
  options?: { refetchIntervalMs?: number; enabled?: boolean }
) {
  const enabled = (options?.enabled ?? true) && !!tournamentId && !!division;
  return useQuery({
    queryKey: ['tournament', tournamentId, 'betting', division],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve({
            bettingSnapshot: getMockDevBettingSnapshot(tournamentId!, division!),
          } as Tournament)
        : (tournamentsApi.findOne(tournamentId!, { betsDivision: division! }) as Promise<Tournament>),
    enabled,
    select: (d) => augmentBettingSnapshotWithLinePicks(d.bettingSnapshot ?? null),
    staleTime: 15_000,
    refetchInterval: shouldUseDevMocks() ? false : options?.refetchIntervalMs,
  });
}

export function usePlaceTournamentBet(tournamentId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      matchId: string;
      kind: 'winner' | 'score';
      pickWinnerTeamId?: string;
      pickPointsA?: number;
      pickPointsB?: number;
    }) =>
      tournamentsApi.action(tournamentId!, {
        action: 'placeTournamentBet',
        ...body,
      }) as Promise<{ bet: unknown }>,
    onSuccess: () => {
      if (tournamentId) {
        qc.invalidateQueries({ queryKey: ['tournament', tournamentId, 'betting'] });
        qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
        qc.invalidateQueries({ queryKey: ['matches'] });
      }
    },
  });
}
