import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Language } from '@/lib/i18n';

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

interface LanguageState {
  language: Language | null;
  hasSelectedLanguage: boolean;
  _hasHydrated: boolean;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: null,
      hasSelectedLanguage: false,
      _hasHydrated: false,
      setLanguage: (language) => set({ language, hasSelectedLanguage: true }),
    }),
    {
      name: 'matchpoint-language',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ language: state.language, hasSelectedLanguage: state.hasSelectedLanguage }),
      onRehydrateStorage: () => (state) => {
        useLanguageStore.setState({
          _hasHydrated: true,
          hasSelectedLanguage: !!state?.hasSelectedLanguage || !!state?.language,
        });
      },
    }
  )
);
