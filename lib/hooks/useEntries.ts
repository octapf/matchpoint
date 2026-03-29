import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entriesApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { hapticSuccess } from '@/lib/haptics';
import { MOCK_DEV_ENTRIES } from '@/lib/mocks/devTournamentMocks';
import type { Entry, Tournament } from '@/types';

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
    staleTime: 30_000,
  });
}

type CreateEntryDoc = { tournamentId: string; userId: string; lookingForPartner?: boolean };

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: Record<string, unknown>) => entriesApi.insertOne(doc) as Promise<Entry>,
    onMutate: async (doc) => {
      const tournamentId = typeof doc.tournamentId === 'string' ? doc.tournamentId : '';
      const userId = typeof doc.userId === 'string' ? doc.userId : '';
      if (!tournamentId || !userId) return {};

      await queryClient.cancelQueries({ queryKey: ['entries', { tournamentId }] });
      await queryClient.cancelQueries({ queryKey: ['tournament', tournamentId] });
      await queryClient.cancelQueries({ queryKey: ['tournaments'] });

      const prevEntries = queryClient.getQueryData<Entry[]>(['entries', { tournamentId }]);
      const prevTournament = queryClient.getQueryData<Tournament>(['tournament', tournamentId]);
      const prevTournaments = queryClient.getQueryData<Tournament[]>(['tournaments']);

      const tempId = `optimistic-${Date.now()}`;
      const optimistic: Entry = {
        _id: tempId,
        tournamentId,
        userId,
        teamId: null,
        lookingForPartner: doc.lookingForPartner !== false,
        status: 'joined',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Entry[]>(['entries', { tournamentId }], (old) =>
        old ? [...old, optimistic] : [optimistic]
      );
      queryClient.setQueryData<Tournament>(['tournament', tournamentId], (old) =>
        old ? { ...old, entriesCount: (old.entriesCount ?? 0) + 1 } : old
      );
      queryClient.setQueryData<Tournament[]>(['tournaments'], (old) =>
        old?.map((t) =>
          t._id === tournamentId ? { ...t, entriesCount: (t.entriesCount ?? 0) + 1 } : t
        )
      );

      return { prevEntries, prevTournament, prevTournaments, tournamentId } as const;
    },
    onError: (_err, _doc, ctx) => {
      if (!ctx?.tournamentId) return;
      const tid = ctx.tournamentId;
      if (ctx.prevEntries !== undefined) {
        queryClient.setQueryData(['entries', { tournamentId: tid }], ctx.prevEntries);
      }
      if (ctx.prevTournament !== undefined) {
        queryClient.setQueryData(['tournament', tid], ctx.prevTournament);
      }
      if (ctx.prevTournaments !== undefined) {
        queryClient.setQueryData(['tournaments'], ctx.prevTournaments);
      }
    },
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
      queryClient.invalidateQueries({ queryKey: ['tournament', data.tournamentId] });
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
