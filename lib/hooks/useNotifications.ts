import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import { shouldUseDevMocks } from '@/lib/config';
import type { Notification } from '@/types';

export function useNotifications(params?: { limit?: number; enabled?: boolean }) {
  const limit = Math.max(1, Math.min(50, params?.limit ?? 30));
  const enabled = params?.enabled ?? true;
  return useQuery({
    queryKey: ['notifications', { limit }],
    queryFn: () => {
      if (shouldUseDevMocks()) return Promise.resolve([] as Notification[]);
      return usersApi.notificationsList({ limit: String(limit) }) as Promise<Notification[]>;
    },
    staleTime: 10_000,
    enabled,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => usersApi.notificationsMarkRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => usersApi.notificationsMarkAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

