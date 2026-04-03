import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { hapticSuccess } from '@/lib/haptics';
import { MOCK_DEV_TEAMS } from '@/lib/mocks/devTournamentMocks';
import type { Team, Tournament } from '@/types';

export function useTeams(params?: { tournamentId?: string; createdBy?: string }) {
  return useQuery({
    queryKey: ['teams', params],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(MOCK_DEV_TEAMS.filter((t) => !params?.tournamentId || t.tournamentId === params.tournamentId))
        : (teamsApi.find(params) as Promise<Team[]>),
    staleTime: 30_000,
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
    onMutate: async (doc) => {
      const tournamentId = typeof doc.tournamentId === 'string' ? doc.tournamentId : '';
      if (!tournamentId) return;
      await queryClient.cancelQueries({ queryKey: ['teams', { tournamentId }] });
      await queryClient.cancelQueries({ queryKey: ['tournament', tournamentId] });
      await queryClient.cancelQueries({ queryKey: ['tournaments'] });

      const prevTeams = queryClient.getQueryData<Team[]>(['teams', { tournamentId }]);
      const prevTournament = queryClient.getQueryData<Tournament>(['tournament', tournamentId]);
      const prevTournaments = queryClient.getQueryData<Tournament[]>(['tournaments']);

      const tempId = `optimistic-team-${Date.now()}`;
      const optimistic: Team = {
        _id: tempId,
        tournamentId,
        name: typeof doc.name === 'string' ? doc.name : '',
        playerIds: Array.isArray(doc.playerIds) ? (doc.playerIds as string[]) : [],
        createdBy: typeof doc.createdBy === 'string' ? doc.createdBy : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Team[]>(['teams', { tournamentId }], (old) =>
        old ? [...old, optimistic] : [optimistic]
      );
      queryClient.setQueryData<Tournament>(['tournament', tournamentId], (old) =>
        old ? { ...old, teamsCount: (old.teamsCount ?? 0) + 1 } : old
      );
      queryClient.setQueryData<Tournament[]>(['tournaments'], (old) =>
        old?.map((t) =>
          t._id === tournamentId ? { ...t, teamsCount: (t.teamsCount ?? 0) + 1 } : t
        )
      );

      return { prevTeams, prevTournament, prevTournaments, tournamentId } as const;
    },
    onError: (_err, _doc, ctx) => {
      if (!ctx?.tournamentId) return;
      const tid = ctx.tournamentId;
      if (ctx.prevTeams !== undefined) {
        queryClient.setQueryData(['teams', { tournamentId: tid }], ctx.prevTeams);
      }
      if (ctx.prevTournament !== undefined) {
        queryClient.setQueryData(['tournament', tid], ctx.prevTournament);
      }
      if (ctx.prevTournaments !== undefined) {
        queryClient.setQueryData(['tournaments'], ctx.prevTournaments);
      }
    },
    onSuccess: (data) => {
      hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist', data.tournamentId] });
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
      queryClient.invalidateQueries({ queryKey: ['waitlist', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      teamsApi.deleteOne(id),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}
