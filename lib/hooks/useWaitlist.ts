import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { waitlistApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';

export function useWaitlist(tournamentId: string | undefined) {
  return useQuery({
    queryKey: ['waitlist', tournamentId],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve({ count: 0, position: null as number | null, users: [] as { userId: string; createdAt: string }[] })
        : waitlistApi.get(tournamentId!),
    enabled: !!tournamentId,
  });
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, userId }: { tournamentId: string; userId: string }) =>
      waitlistApi.join(tournamentId, userId),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tournamentId, actingUserId }: { tournamentId: string; actingUserId: string }) =>
      waitlistApi.leave(tournamentId, actingUserId),
    onSuccess: (_, { tournamentId }) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}
