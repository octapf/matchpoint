import React, { createContext, useContext, useEffect, useState } from 'react';
import { I18n } from 'i18n-js';
import { Platform } from 'react-native';

import en from './en.json';
import es from './es.json';
import it from './it.json';

export const LANGUAGES = ['en', 'es', 'it'] as const;
export type Language = (typeof LANGUAGES)[number];

const getDeviceLocale = (): Language => {
  let locale = 'en';

  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    locale = navigator.language || 'en';
  } else {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    } catch {
      locale = 'en';
    }
  }

  if (locale.toLowerCase().startsWith('it')) return 'it';
  if (locale.toLowerCase().startsWith('es')) return 'es';
  return 'en';
};

const translations = { en, es, it };
export const i18n = new I18n(translations);
i18n.defaultLocale = 'en';
i18n.locale = getDeviceLocale();

type TranslateFn = (key: string, options?: Record<string, string | number>) => string;

const I18nContext = createContext<{ t: TranslateFn; locale: Language } | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Language>(i18n.locale as Language);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsub = i18n.onChange(() => {
      setLocale(i18n.locale as Language);
      forceUpdate((n) => n + 1);
    });
    return unsub;
  }, []);

  const t: TranslateFn = (key, options) => {
    return i18n.t(key, options as Record<string, unknown>) as string;
  };

  return React.createElement(I18nContext.Provider, { value: { t, locale } }, children);
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      t: (key: string, options?: Record<string, string | number>) =>
        i18n.t(key, options as Record<string, unknown>) as string,
      i18n,
    };
  }
  return { t: ctx.t, i18n };
}

export default i18n;
