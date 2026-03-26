import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import { getMockDevUserById, getMockDevUsersByIds } from '@/lib/mocks/devTournamentMocks';
import type { User } from '@/types';

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => {
      if (!id) return Promise.resolve(null);
      if (shouldUseDevMocks()) return Promise.resolve(getMockDevUserById(id));
      return usersApi.findOne({ id }) as Promise<User>;
    },
    enabled: !!id,
  });
}

export function useUsers(ids: (string | undefined)[]) {
  const validIds = [...new Set(ids.filter((id): id is string => !!id))];
  return useQuery({
    queryKey: ['users', validIds.sort().join(',')],
    queryFn: () => {
      if (validIds.length === 0) return Promise.resolve([]);
      if (shouldUseDevMocks()) return Promise.resolve(getMockDevUsersByIds(validIds));
      return usersApi.findByIds(validIds) as Promise<User[]>;
    },
    enabled: validIds.length > 0,
  });
}
