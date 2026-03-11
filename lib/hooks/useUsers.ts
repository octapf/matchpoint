import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { User } from '@/types';

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => (config.api.isConfigured && id ? usersApi.findOne({ id }) as Promise<User> : Promise.resolve(null)),
    enabled: !!id,
  });
}

export function useUsers(ids: (string | undefined)[]) {
  const validIds = [...new Set(ids.filter((id): id is string => !!id))];
  return useQuery({
    queryKey: ['users', validIds.sort().join(',')],
    queryFn: () =>
      config.api.isConfigured && validIds.length > 0
        ? (usersApi.findByIds(validIds) as Promise<User[]>)
        : Promise.resolve([]),
    enabled: validIds.length > 0,
  });
}
