import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { waitlistApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { hapticSuccess } from '@/lib/haptics';
import type { Tournament, TournamentDivision } from '@/types';

export type WaitlistInfo = {
  count: number;
  position: number | null;
  users: { userId: string; createdAt: string }[];
};

const emptyWaitlist = (): WaitlistInfo => ({
  count: 0,
  position: null,
  users: [],
});

export function useWaitlist(tournamentId: string | undefined, division: TournamentDivision | undefined) {
  return useQuery({
    queryKey: ['waitlist', tournamentId, division],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(emptyWaitlist())
        : waitlistApi.get(tournamentId!, (division ?? 'mixed') as TournamentDivision),
    enabled: !!tournamentId && !!division,
    staleTime: 15_000,
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, division, userId }: { tournamentId: string; division: TournamentDivision; userId: string }) =>
      waitlistApi.join(tournamentId, division, userId),
    onMutate: async ({ tournamentId, division, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['waitlist', tournamentId, division] });
      await queryClient.cancelQueries({ queryKey: ['tournament', tournamentId] });
      await queryClient.cancelQueries({ queryKey: ['tournaments'] });

      const previous = queryClient.getQueryData<WaitlistInfo>(['waitlist', tournamentId, division]);
      const prevTournament = queryClient.getQueryData<Tournament>(['tournament', tournamentId]);
      const prevTournaments = queryClient.getQueryData<Tournament[]>(['tournaments']);

      const now = new Date().toISOString();
      const users = [...(previous?.users ?? []), { userId, createdAt: now }];
      const next: WaitlistInfo = {
        count: users.length,
        position: users.findIndex((u) => u.userId === userId) + 1 || users.length,
        users,
      };
      queryClient.setQueryData(['waitlist', tournamentId, division], next);
      queryClient.setQueryData<Tournament>(['tournament', tournamentId], (old) =>
        old ? { ...old, waitlistCount: users.length } : old
      );
      queryClient.setQueryData<Tournament[]>(['tournaments'], (old) =>
        old?.map((t) =>
          t._id === tournamentId ? { ...t, waitlistCount: users.length } : t
        )
      );

      return { previous, prevTournament, prevTournaments, tournamentId, division } as const;
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.tournamentId) return;
      const tid = ctx.tournamentId;
      const div = ctx.division;
      if (ctx.previous !== undefined) {
        queryClient.setQueryData(['waitlist', tid, div], ctx.previous);
      }
      if (ctx.prevTournament !== undefined) {
        queryClient.setQueryData(['tournament', tid], ctx.prevTournament);
      }
      if (ctx.prevTournaments !== undefined) {
        queryClient.setQueryData(['tournaments'], ctx.prevTournaments);
      }
    },
    onSuccess: (_data, { tournamentId, division }) => {
      hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId, division] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, division }: { tournamentId: string; division: TournamentDivision }) =>
      waitlistApi.leave(tournamentId, division),
    onSuccess: (_data, { tournamentId, division }) => {
      hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId, division] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}
