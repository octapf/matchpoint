import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { tournamentsApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { MOCK_DEV_TOURNAMENT, MOCK_DEV_ENTRIES, MOCK_DEV_TEAMS } from '@/lib/mocks/devTournamentMocks';
import { countGroupsWithTeams } from '@/lib/tournamentGroups';
import type { Tournament } from '@/types';

const MOCK_TOURNAMENTS: Tournament[] = [
  {
    ...MOCK_DEV_TOURNAMENT,
    entriesCount: MOCK_DEV_ENTRIES.length,
    teamsCount: MOCK_DEV_TEAMS.length,
    groupsWithTeamsCount: countGroupsWithTeams(MOCK_DEV_TEAMS, MOCK_DEV_TOURNAMENT.groupCount ?? 4),
    waitlistCount: 0,
  },
];

export function useTournaments(params?: { status?: string; organizerId?: string }) {
  return useQuery({
    queryKey: ['tournaments', params],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve(MOCK_TOURNAMENTS)
        : (tournamentsApi.find(params) as Promise<Tournament[]>),
    staleTime: 60_000,
  });
}

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ['tournament', id],
    queryFn: () =>
      shouldUseDevMocks()
        ? Promise.resolve({
            ...MOCK_DEV_TOURNAMENT,
            _id: id || MOCK_DEV_TOURNAMENT._id,
            waitlistCount: MOCK_DEV_TOURNAMENT.waitlistCount ?? 0,
          })
        : (tournamentsApi.findOne(id!) as Promise<Tournament>),
    enabled: !!id,
    placeholderData: keepPreviousData,
    staleTime: 45_000,
  });
}

/** Resolve tournament by invite link token (path /t/{inviteLink}). Always match inviteLink first; ObjectId fallback last. */
export function useTournamentByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['tournamentByToken', token],
    queryFn: async () => {
      if (!token) return null;
      const trimmed = token.trim();
      if (!trimmed) return null;
      if (shouldUseDevMocks()) {
        return { ...MOCK_DEV_TOURNAMENT, inviteLink: trimmed };
      }
      const byInvite = (await tournamentsApi.find({ inviteLink: trimmed })) as Tournament[];
      if (byInvite.length > 0) return byInvite[0]!;
      if (/^[a-f0-9]{24}$/i.test(trimmed)) {
        return tournamentsApi.findOne(trimmed) as Promise<Tournament>;
      }
      return null;
    },
    enabled: !!token?.trim(),
    staleTime: 45_000,
  });
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: Record<string, unknown>) => tournamentsApi.insertOne(doc) as Promise<Tournament>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useUpdateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      tournamentsApi.updateOne(id, body) as Promise<Tournament>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', data._id] });
      queryClient.invalidateQueries({ queryKey: ['entries', { tournamentId: data._id }] });
    },
  });
}

export function useRebalanceTournamentGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => tournamentsApi.rebalanceTeams(id),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
    },
  });
}

export function useStartTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, matchesPerOpponent }: { id: string; matchesPerOpponent?: number }) =>
      tournamentsApi.action(id, { action: 'start', matchesPerOpponent }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });
}

export function useRandomizeTournamentGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => tournamentsApi.action(id, { action: 'randomizeGroups' }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
    },
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => tournamentsApi.deleteOne(id),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      router.replace('/(tabs)/feed');
    },
  });
}
