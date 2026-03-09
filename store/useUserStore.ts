import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@/types';

// expo-secure-store works in Expo Go on Android (AsyncStorage has native module issues)
const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

interface UserState {
  user: User | null;
  _hasHydrated: boolean;
  setUser: (user: User | null) => void;
  signOut: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      _hasHydrated: false,
      setUser: (user) => set({ user }),
      signOut: () => set({ user: null }),
    }),
    {
      name: 'matchpoint-user',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => () => {
        useUserStore.setState({ _hasHydrated: true });
      },
    }
  )
);

/** Convenience: userId for backwards compatibility */
export const useUserId = () => useUserStore((s) => s.user?._id ?? null);
