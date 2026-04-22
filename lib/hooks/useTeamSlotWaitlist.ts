import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { teamSlotWaitlistApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import type { TournamentDivision } from '@/types';

export type TeamSlotWaitlistRow = {
  _id: string;
  tournamentId?: string;
  division?: TournamentDivision;
  name?: string;
  playerIds?: string[];
  createdBy?: string;
  createdAt?: string;
};

export function useTeamSlotWaitlist(tournamentId: string | undefined, division?: TournamentDivision) {
  return useQuery({
    queryKey: ['teamSlotWaitlist', tournamentId, division ?? 'all'],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve([] as TeamSlotWaitlistRow[])
        : (teamSlotWaitlistApi.get(tournamentId!, division) as Promise<TeamSlotWaitlistRow[]>),
    enabled: !!tournamentId && !shouldUseDevMocks(),
    staleTime: 15_000,
  });
}

export function useJoinTeamSlotWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { tournamentId: string; name: string; playerIds: [string, string]; createdBy: string }) =>
      teamSlotWaitlistApi.join(body) as Promise<unknown>,
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['teamSlotWaitlist', vars.tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ['teams', { tournamentId: vars.tournamentId }] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['tournament', vars.tournamentId] });
    },
  });
}

export function useLeaveTeamSlotWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) => teamSlotWaitlistApi.leave(id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['teamSlotWaitlist', vars.tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ['teams', { tournamentId: vars.tournamentId }] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      void queryClient.invalidateQueries({ queryKey: ['tournament', vars.tournamentId] });
    },
  });
}
