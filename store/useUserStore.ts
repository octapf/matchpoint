import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@/types';

// expo-secure-store doesn't work on web - use localStorage instead
const secureStorage =
  Platform.OS === 'web'
    ? {
        getItem: (name: string) =>
          Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(name) : null),
        setItem: (name: string, value: string) => {
          if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
          return Promise.resolve();
        },
        removeItem: (name: string) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(name);
          return Promise.resolve();
        },
      }
    : {
        getItem: (name: string) => SecureStore.getItemAsync(name),
        setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
        removeItem: (name: string) => SecureStore.deleteItemAsync(name),
      };

interface UserState {
  user: User | null;
  /** JWT from /api auth; sent as Authorization Bearer on API calls */
  accessToken: string | null;
  _hasHydrated: boolean;
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setSession: (payload: { user: User; accessToken: string }) => void;
  signOut: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      _hasHydrated: false,
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setSession: ({ user, accessToken }) => set({ user, accessToken }),
      signOut: () => set({ user: null, accessToken: null }),
    }),
    {
      name: 'matchpoint-user',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
      onRehydrateStorage: () => () => {
        useUserStore.setState({ _hasHydrated: true });
      },
    }
  )
);

/** Convenience: userId for backwards compatibility */
export const useUserId = () => useUserStore((s) => s.user?._id ?? null);
