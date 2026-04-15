import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ThemePresetId } from '@/lib/theme/colors';

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

interface ThemeState {
  presetId: ThemePresetId | null;
  _hasHydrated: boolean;
  setPresetId: (id: ThemePresetId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      presetId: null,
      _hasHydrated: false,
      setPresetId: (presetId) => set({ presetId }),
    }),
    {
      name: 'matchpoint-theme',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ presetId: state.presetId }),
      onRehydrateStorage: () => () => {
        useThemeStore.setState({ _hasHydrated: true });
      },
    }
  )
);

