import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { MOCK_DEV_ENTRIES } from '@/lib/mocks/devTournamentMocks';
import type { Entry } from '@/types';

export function useEntries(
  params?: { tournamentId?: string; userId?: string; teamId?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['entries', params],
    enabled: options?.enabled ?? true,
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(
            MOCK_DEV_ENTRIES.filter((e) => {
              if (params?.tournamentId && e.tournamentId !== params.tournamentId) return false;
              if (params?.userId && e.userId !== params.userId) return false;
              if (params?.teamId != null && params.teamId !== '' && e.teamId !== params.teamId) return false;
              return true;
            })
          )
        : (entriesApi.find(params) as Promise<Entry[]>),
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: Record<string, unknown>) => entriesApi.insertOne(doc) as Promise<Entry>,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      if (variables.tournamentId) {
        queryClient.invalidateQueries({ queryKey: ['tournament', variables.tournamentId] });
        queryClient.invalidateQueries({ queryKey: ['waitlist', variables.tournamentId] });
      }
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: Record<string, unknown> }) =>
      entriesApi.updateOne(id, update) as Promise<Entry>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
    },
  });
}

export function useDeleteEntry() {
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
    }) => entriesApi.deleteOne(id, actingUserId),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
    },
  });
}
