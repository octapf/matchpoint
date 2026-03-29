import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      /** Lists and reference data — balance freshness vs. chatter */
      staleTime: 60 * 1000,
      gcTime: 30 * 60 * 1000,
      networkMode: 'online',
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
});
