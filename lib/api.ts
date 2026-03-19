/**
 * Matchpoint API client
 * Calls the Vercel backend (MongoDB)
 */

import { config } from './config';

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

  return fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
  }).then(async (res) => {
    if (res.status === 204) return undefined as T;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error: ${res.status}`);
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
    apiRequest<void>(`/api/tournaments/${id}`, { method: 'DELETE' }),
};

// Entries
export const entriesApi = {
  find: (params?: { tournamentId?: string; userId?: string; teamId?: string }) =>
    apiRequest<unknown[]>('/api/entries', { params: params as Record<string, string> }),

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

  deleteOne: (id: string) =>
    apiRequest<void>(`/api/entries/${id}`, { method: 'DELETE' }),
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

  deleteOne: (id: string) =>
    apiRequest<void>(`/api/teams/${id}`, { method: 'DELETE' }),
};

// Auth
export const authApi = {
  signInWithGoogle: (idToken: string) =>
    apiRequest<unknown>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  signInWithApple: (identityToken: string, user?: { firstName?: string; lastName?: string }) =>
    apiRequest<unknown>('/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({
        identityToken,
        firstName: user?.firstName,
        lastName: user?.lastName,
      }),
    }),

  signUp: (data: {
    email: string;
    username: string;
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

  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    apiRequest<{ message: string }>('/api/auth/email?action=change-password', {
      method: 'POST',
      body: JSON.stringify({ userId, currentPassword, newPassword }),
    }),
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

  insertOne: (document: Record<string, unknown>) =>
    apiRequest<unknown>('/api/users', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  updateOne: (id: string, update: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/users?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),
};
