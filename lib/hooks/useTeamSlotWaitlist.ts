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
    onMutate: async (vars) => {
      const tournamentId = vars.tournamentId;
      if (!tournamentId) return {};

      await queryClient.cancelQueries({ queryKey: ['teamSlotWaitlist', tournamentId] });
      const previous = queryClient.getQueriesData<TeamSlotWaitlistRow[]>({
        queryKey: ['teamSlotWaitlist', tournamentId],
      });

      const optimistic: TeamSlotWaitlistRow = {
        _id: `optimistic-team-slot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        tournamentId,
        name: vars.name,
        playerIds: vars.playerIds,
        createdBy: vars.createdBy,
        createdAt: new Date().toISOString(),
      };

      const addOptimistic = (old: TeamSlotWaitlistRow[] | undefined) => {
        const cur = Array.isArray(old) ? old : [];
        const already = cur.some((r) => {
          const p = Array.isArray(r.playerIds) ? r.playerIds : [];
          return (
            r.tournamentId === tournamentId &&
            r.createdBy === vars.createdBy &&
            p.length === 2 &&
            p[0] === vars.playerIds[0] &&
            p[1] === vars.playerIds[1]
          );
        });
        if (already) return cur;
        return [optimistic, ...cur];
      };

      // Update every cached list for this tournament (division-specific + "all") so UI updates instantly.
      queryClient.setQueriesData<TeamSlotWaitlistRow[]>(
        { queryKey: ['teamSlotWaitlist', tournamentId] },
        (old) => addOptimistic(old)
      );
      queryClient.setQueryData<TeamSlotWaitlistRow[]>(['teamSlotWaitlist', tournamentId, 'all'], (old) =>
        addOptimistic(old)
      );

      return { previous, tournamentId, optimisticId: optimistic._id };
    },
    onError: (_err, vars, ctx) => {
      const anyCtx = ctx as unknown as { previous?: Array<[unknown, TeamSlotWaitlistRow[] | undefined]>; tournamentId?: string };
      if (!anyCtx?.tournamentId) return;
      const snapshots = anyCtx.previous ?? [];
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key as never, (data ?? []) as never);
      }
    },
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
