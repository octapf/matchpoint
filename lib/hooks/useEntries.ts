import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Entry } from '@/types';

const MOCK_ENTRIES: Entry[] = [
  { _id: '1', tournamentId: '1', userId: 'dev-user-1', teamId: '1', lookingForPartner: false, status: 'in_team', createdAt: '', updatedAt: '' },
  { _id: '2', tournamentId: '1', userId: 'dev-user-2', teamId: null, lookingForPartner: true, status: 'joined', createdAt: '', updatedAt: '' },
];

export function useEntries(
  params?: { tournamentId?: string; userId?: string; teamId?: string },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['entries', params],
    enabled: options?.enabled ?? true,
    queryFn: () =>
      config.api.isConfigured
        ? (entriesApi.find(params) as Promise<Entry[]>)
        : Promise.resolve(
            MOCK_ENTRIES.filter((e) => {
              if (params?.tournamentId && e.tournamentId !== params.tournamentId) return false;
              if (params?.userId && e.userId !== params.userId) return false;
              return true;
            })
          ),
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
      }
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
    },
  });
}
