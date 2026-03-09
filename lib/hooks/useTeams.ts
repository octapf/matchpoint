import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Team } from '@/types';

const MOCK_TEAMS: Team[] = [
  { _id: '1', tournamentId: '1', name: 'Team Alpha', playerIds: ['u1', 'u2'], createdBy: 'u1', createdAt: '', updatedAt: '' },
  { _id: '2', tournamentId: '1', name: 'Beach Volley', playerIds: ['u3'], createdBy: 'u3', createdAt: '', updatedAt: '' },
];

export function useTeams(params?: { tournamentId?: string; createdBy?: string }) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: () =>
      config.api.isConfigured
        ? (teamsApi.find(params) as Promise<Team[]>)
        : Promise.resolve(MOCK_TEAMS.filter((t) => !params?.tournamentId || t.tournamentId === params.tournamentId)),
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: ['team', id],
    queryFn: () =>
      config.api.isConfigured && id
        ? (teamsApi.findOne(id) as Promise<Team>)
        : Promise.resolve(MOCK_TEAMS.find((t) => t._id === id) ?? null),
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: Record<string, unknown>) => teamsApi.insertOne(doc) as Promise<Team>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
    },
  });
}
