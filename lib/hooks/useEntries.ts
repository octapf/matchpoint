import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { hapticSuccess } from '@/lib/haptics';
import { MOCK_DEV_ENTRIES } from '@/lib/mocks/devTournamentMocks';
import type { Entry } from '@/types';

export function useEntries(
  params?: { tournamentId?: string; userId?: string; teamId?: string; inTeamOnly?: boolean },
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
              if (params?.inTeamOnly && (e.teamId == null || e.teamId === '')) return false;
              return true;
            })
          )
        : (entriesApi.find(params) as Promise<Entry[]>),
    staleTime: 30_000,
  });
}

type CreateEntryDoc = { tournamentId: string; userId: string; lookingForPartner?: boolean };

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    /** Join tournament = join waiting list (no roster entry until a team exists). */
    mutationFn: (doc: Record<string, unknown>) => entriesApi.insertOne(doc) as Promise<unknown>,
    onSuccess: (_data, variables) => {
      hapticSuccess();
      const v = variables as CreateEntryDoc;
      if (v.tournamentId) {
        queryClient.invalidateQueries({ queryKey: ['entries'] });
        queryClient.invalidateQueries({ queryKey: ['tournament', v.tournamentId] });
        queryClient.invalidateQueries({ queryKey: ['waitlist', v.tournamentId] });
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['entries'] });
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
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
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tournamentId }: { id: string; tournamentId: string }) =>
      entriesApi.deleteOne(id),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
    },
  });
}
