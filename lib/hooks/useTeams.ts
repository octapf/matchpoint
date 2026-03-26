import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { MOCK_DEV_TEAMS } from '@/lib/mocks/devTournamentMocks';
import type { Team } from '@/types';

export function useTeams(params?: { tournamentId?: string; createdBy?: string }) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(MOCK_DEV_TEAMS.filter((t) => !params?.tournamentId || t.tournamentId === params.tournamentId))
        : (teamsApi.find(params) as Promise<Team[]>),
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: ['team', id],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(MOCK_DEV_TEAMS.find((t) => t._id === id) ?? null)
        : (teamsApi.findOne(id!) as Promise<Team>),
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: Record<string, unknown>) => teamsApi.insertOne(doc) as Promise<Team>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: Record<string, unknown> }) =>
      teamsApi.updateOne(id, update) as Promise<Team>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team', data._id] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      actingUserId,
      tournamentId,
    }: {
      id: string;
      actingUserId: string;
      tournamentId: string;
    }) => teamsApi.deleteOne(id, actingUserId),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}
