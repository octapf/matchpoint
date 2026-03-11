import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { tournamentsApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Tournament } from '@/types';

const MOCK_TOURNAMENTS: Tournament[] = [
  { _id: '1', name: 'Summer Beach Cup', date: '2026-07-15', location: 'Barceloneta Beach', maxTeams: 16, inviteLink: '', status: 'open', organizerIds: [], createdAt: '', updatedAt: '' },
  { _id: '2', name: 'Weekend Volley', date: '2026-07-22', location: 'Nova Icària', maxTeams: 16, inviteLink: '', status: 'open', organizerIds: [], createdAt: '', updatedAt: '' },
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

/** Resolve tournament by ID (ObjectId) or invite link token */
export function useTournamentByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['tournamentByToken', token],
    queryFn: async () => {
      if (!token) return null;
      if (!config.api.isConfigured) {
        return { ...MOCK_TOURNAMENT, _id: token, inviteLink: token };
      }
      if (/^[a-f0-9]{24}$/i.test(token)) {
        return tournamentsApi.findOne(token) as Promise<Tournament>;
      }
      const list = (await tournamentsApi.find({ inviteLink: token })) as Tournament[];
      return list[0] ?? null;
    },
    enabled: !!token,
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

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (id: string) => tournamentsApi.deleteOne(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      router.replace('/(tabs)');
    },
  });
}
