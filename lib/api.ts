/**
 * Matchpoint API client
 * Calls the Vercel backend (MongoDB)
 */

import { config } from './config';
import { useUserStore } from '@/store/useUserStore';
import { isNetworkError, NETWORK_ERROR_SENTINEL } from '@/lib/utils/apiError';

const baseUrl = config.api.baseUrl;

function apiRequest<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {}
): Promise<T> {
  if (!config.api.isConfigured) {
    throw new Error(
      'API not configured. Add EXPO_PUBLIC_API_URL to .env (e.g. https://your-app.vercel.app)'
    );
  }

  const { params, ...fetchOptions } = options;
  let url = `${baseUrl}${path}`;
  if (params && Object.keys(params).length > 0) {
    const search = new URLSearchParams(params).toString();
    url += (path.includes('?') ? '&' : '?') + search;
  }

  const token = useUserStore.getState().accessToken;
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...fetchOptions,
    headers,
  })
    .catch((e: unknown) => {
      if (isNetworkError(e)) throw new Error(NETWORK_ERROR_SENTINEL);
      throw e;
    })
    .then(async (res) => {
    if (res.status === 204 || res.status === 205) return undefined as T;
    const text = await res.text();
    if (!text) {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return undefined as T;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      throw new Error('Invalid response from server');
    }
    const errMsg =
      typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : undefined;
    if (!res.ok) {
      const e = new Error(errMsg || `API error: ${res.status}`);
      if (typeof data === 'object' && data !== null) {
        const anyData = data as Record<string, unknown>;
        if (typeof anyData.remaining === 'number') (e as Error & { remaining?: number }).remaining = anyData.remaining;
      }
      throw e;
    }
    return data as T;
  });
}

// Tournaments
export const tournamentsApi = {
  find: (params?: { status?: string; organizerId?: string; inviteLink?: string }) =>
    apiRequest<unknown[]>('/api/tournaments', { params: params as Record<string, string> }),

  findOne: (id: string) => apiRequest<unknown>(`/api/tournaments/${id}`),

  insertOne: (document: Record<string, unknown>) =>
    apiRequest<unknown>('/api/tournaments', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  updateOne: (id: string, update: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/tournaments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteOne: (id: string) =>
    apiRequest<void>(`/api/tournaments/${id}`, {
      method: 'DELETE',
    }),

  rebalanceTeams: (id: string) =>
    apiRequest<{ updated: number; teams: number }>(`/api/tournaments/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'rebalanceGroups' }),
    }),

  action: (id: string, body: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/tournaments/${id}`, { method: 'POST', body: JSON.stringify(body) }),

  findOneWithMatches: (id: string) =>
    apiRequest<unknown>(`/api/tournaments/${id}`, { params: { includeMatches: '1' } }),
};

// Entries
export const entriesApi = {
  find: (params?: { tournamentId?: string; userId?: string; teamId?: string; inTeamOnly?: boolean }) => {
    const p: Record<string, string> = {};
    if (params?.tournamentId) p.tournamentId = params.tournamentId;
    if (params?.userId) p.userId = params.userId;
    if (params?.teamId) p.teamId = params.teamId;
    if (params?.inTeamOnly) p.inTeamOnly = '1';
    return apiRequest<unknown[]>('/api/entries', { params: p });
  },

  findOne: (id: string) => apiRequest<unknown>(`/api/entries/${id}`),

  insertOne: (document: Record<string, unknown>) =>
    apiRequest<unknown>('/api/entries', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  updateOne: (id: string, update: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteOne: (id: string) => apiRequest<void>(`/api/entries/${id}`, { method: 'DELETE' }),
};

export const waitlistApi = {
  get: (tournamentId: string, division: 'men' | 'women' | 'mixed') =>
    apiRequest<{ count: number; position: number | null; users: { userId: string; createdAt: string }[] }>('/api/waitlist', {
      params: { tournamentId, division },
    }),

  join: (tournamentId: string, division: 'men' | 'women' | 'mixed', userId: string) =>
    apiRequest<unknown>('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify({ tournamentId, division, userId }),
    }),

  leave: (tournamentId: string, division: 'men' | 'women' | 'mixed') =>
    apiRequest<void>('/api/waitlist', {
      method: 'DELETE',
      params: { tournamentId, division },
    }),
};

// Teams
export const teamsApi = {
  find: (params?: { tournamentId?: string; createdBy?: string }) =>
    apiRequest<unknown[]>('/api/teams', { params: params as Record<string, string> }),

  findOne: (id: string) => apiRequest<unknown>(`/api/teams/${id}`),

  insertOne: (document: Record<string, unknown>) =>
    apiRequest<unknown>('/api/teams', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  updateOne: (id: string, update: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteOne: (id: string) => apiRequest<void>(`/api/teams/${id}`, { method: 'DELETE' }),
};

// Auth
export const authApi = {
  signInWithGoogle: (idToken: string) =>
    apiRequest<unknown>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  signUp: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) =>
    apiRequest<unknown>('/api/auth/email?action=signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (identifier: string, password: string) =>
    apiRequest<unknown>('/api/auth/email?action=login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  forgotPassword: (email: string) =>
    apiRequest<{ message: string }>('/api/auth/email?action=forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    apiRequest<{ message: string }>('/api/auth/email?action=reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ message: string }>('/api/auth/email?action=change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  /** Current user from Bearer session (requires accessToken in store). */
  me: () => apiRequest<unknown>('/api/auth/me'),
};

// Users
export const usersApi = {
  findOne: (params: { id?: string; email?: string }) =>
    apiRequest<unknown>('/api/users', { params: params as Record<string, string> }),

  findByIds: (ids: string[]) =>
    apiRequest<unknown[]>(
      '/api/users',
      { params: { ids: ids.filter(Boolean).join(',') } }
    ),

  updateOne: (id: string, update: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/users?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteOne: (id: string) =>
    apiRequest<void>(`/api/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Notifications (in-app inbox)
  notificationsList: (params?: { limit?: string; cursor?: string }) =>
    apiRequest<unknown[]>('/api/users', {
      params: {
        type: 'notifications',
        ...(params?.limit ? { limit: params.limit } : {}),
        ...(params?.cursor ? { cursor: params.cursor } : {}),
      },
    }),

  notificationsMarkRead: (ids: string[]) =>
    apiRequest<unknown>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'notifications.markRead', ids }),
    }),

  notificationsMarkAllRead: () =>
    apiRequest<unknown>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ action: 'notifications.markAllRead' }),
    }),
};

/** Dev seed users (admin GET devSeedInfo / POST devSeed). */
export type AdminDevSeedUserRow = {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
};

export type AdminDevSeedInfo = {
  exists: boolean;
  tournamentId: string | null;
  inviteLink: string;
  password: string;
  users: AdminDevSeedUserRow[];
};

export type AdminDevSeedResult = AdminDevSeedInfo & {
  alreadyExists: boolean;
  teamsCount?: number;
  entriesCount?: number;
  waitlistCount?: number;
};

export type AdminDevSeedPurgeResult = {
  removed: {
    tournament: boolean;
    teams: number;
    entries: number;
    waitlist: number;
    users: number;
  };
};

/** Admin API (Bearer + admin role on server). Single /api/admin route (Vercel Hobby function limit). */
export const adminApi = {
  stats: () =>
    apiRequest<{ users: number; tournaments: number; entries: number; teams: number }>(
      '/api/admin',
      { params: { type: 'stats' } }
    ),
  tournaments: (params?: { limit?: string }) =>
    apiRequest<unknown[]>('/api/admin', {
      params: {
        type: 'tournaments',
        ...(params?.limit ? { limit: params.limit } : {}),
      },
    }),

  users: (params?: { limit?: string }) =>
    apiRequest<unknown[]>('/api/admin', {
      params: {
        type: 'users',
        ...(params?.limit ? { limit: params.limit } : {}),
      },
    }),

  devSeedInfo: () => apiRequest<AdminDevSeedInfo>('/api/admin', { params: { type: 'devSeedInfo' } }),

  runDevSeed: (body: { force?: boolean }) =>
    apiRequest<AdminDevSeedResult>('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'devSeed', ...body }),
    }),

  purgeDevSeed: () =>
    apiRequest<AdminDevSeedPurgeResult>('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'devSeedPurge' }),
    }),

  dbBackfill: (body?: { tournamentId?: string | null }) =>
    apiRequest<unknown>('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'dbBackfill', ...(body?.tournamentId ? { tournamentId: body.tournamentId } : {}) }),
    }),

  dbIndexes: () =>
    apiRequest<unknown>('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'dbIndexes' }),
    }),
};
