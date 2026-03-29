import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { waitlistApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { hapticSuccess } from '@/lib/haptics';
import type { Tournament } from '@/types';

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

export function useWaitlist(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['waitlist', tournamentId],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(emptyWaitlist())
        : waitlistApi.get(tournamentId!),
    enabled: !!tournamentId,
    staleTime: 15_000,
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, userId }: { tournamentId: string; userId: string }) =>
      waitlistApi.join(tournamentId, userId),
    onMutate: async ({ tournamentId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['waitlist', tournamentId] });
      await queryClient.cancelQueries({ queryKey: ['tournament', tournamentId] });
      await queryClient.cancelQueries({ queryKey: ['tournaments'] });

      const previous = queryClient.getQueryData<WaitlistInfo>(['waitlist', tournamentId]);
      const prevTournament = queryClient.getQueryData<Tournament>(['tournament', tournamentId]);
      const prevTournaments = queryClient.getQueryData<Tournament[]>(['tournaments']);

      const now = new Date().toISOString();
      const users = [...(previous?.users ?? []), { userId, createdAt: now }];
      const next: WaitlistInfo = {
        count: users.length,
        position: users.findIndex((u) => u.userId === userId) + 1 || users.length,
        users,
      };
      queryClient.setQueryData(['waitlist', tournamentId], next);
      queryClient.setQueryData<Tournament>(['tournament', tournamentId], (old) =>
        old ? { ...old, waitlistCount: users.length } : old
      );
      queryClient.setQueryData<Tournament[]>(['tournaments'], (old) =>
        old?.map((t) =>
          t._id === tournamentId ? { ...t, waitlistCount: users.length } : t
        )
      );

      return { previous, prevTournament, prevTournaments, tournamentId } as const;
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.tournamentId) return;
      const tid = ctx.tournamentId;
      if (ctx.previous !== undefined) {
        queryClient.setQueryData(['waitlist', tid], ctx.previous);
      }
      if (ctx.prevTournament !== undefined) {
        queryClient.setQueryData(['tournament', tid], ctx.prevTournament);
      }
      if (ctx.prevTournaments !== undefined) {
        queryClient.setQueryData(['tournaments'], ctx.prevTournaments);
      }
    },
    onSuccess: (_data, { tournamentId }) => {
      hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId }: { tournamentId: string }) => waitlistApi.leave(tournamentId),
    onSuccess: (_data, { tournamentId }) => {
      hapticSuccess();
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}
