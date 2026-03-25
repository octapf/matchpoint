import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { tournamentsApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Tournament } from '@/types';

const MOCK_TOURNAMENTS: Tournament[] = [
  {
    _id: '1',
    name: 'Summer Beach Cup',
    date: '2026-07-15',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    location: 'Barceloneta Beach',
    maxTeams: 16,
    inviteLink: '',
    status: 'open',
    organizerIds: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    _id: '2',
    name: 'Weekend Volley',
    date: '2026-07-22',
    startDate: '2026-07-22',
    endDate: '2026-07-22',
    location: 'Nova Icària',
    maxTeams: 16,
    inviteLink: '',
    status: 'open',
    organizerIds: [],
    createdAt: '',
    updatedAt: '',
  },
];

export function useTournaments(params?: { status?: string; organizerId?: string }) {
  return useQuery({
    queryKey: ['tournaments', params],
    queryFn: () =>
      config.api.isConfigured
        ? (tournamentsApi.find(params) as Promise<Tournament[]>)
        : Promise.resolve(MOCK_TOURNAMENTS),
  });
}

const MOCK_TOURNAMENT: Tournament = {
  _id: '1',
  name: 'Summer Beach Cup',
  date: '2026-07-15',
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  location: 'Barceloneta Beach',
  maxTeams: 16,
  inviteLink: '',
  status: 'open',
  organizerIds: [],
  createdAt: '',
  updatedAt: '',
};

export function useTournament(id: string | undefined) {
  return useQuery({
    queryKey: ['tournament', id],
    queryFn: () =>
      config.api.isConfigured && id
        ? (tournamentsApi.findOne(id) as Promise<Tournament>)
        : Promise.resolve({ ...MOCK_TOURNAMENT, _id: id || '1' }),
    enabled: !!id,
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
      if (!config.api.isConfigured) {
        return { ...MOCK_TOURNAMENT, _id: trimmed, inviteLink: trimmed };
      }
      const byInvite = (await tournamentsApi.find({ inviteLink: trimmed })) as Tournament[];
      if (byInvite.length > 0) return byInvite[0]!;
      if (/^[a-f0-9]{24}$/i.test(trimmed)) {
        return tournamentsApi.findOne(trimmed) as Promise<Tournament>;
      }
      return null;
    },
    enabled: !!token?.trim(),
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
    },
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: ({ id, actingUserId }: { id: string; actingUserId: string }) =>
      tournamentsApi.deleteOne(id, actingUserId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      router.replace('/(tabs)');
    },
  });
}
