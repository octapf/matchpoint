import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Platform, View, StyleSheet } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { queryClient } from '@/lib/queryClient';
import { I18nProvider, i18n, useTranslation } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';
import { useUserStore } from '@/store/useUserStore';
import { OfflineBanner } from '@/components/OfflineBanner';
import { initAppObservability } from '@/lib/observability/app';
import { useThemeStore } from '@/store/useThemeStore';
import { DEFAULT_THEME_PRESET_ID, THEME_PRESETS, type ThemePresetId } from '@/lib/theme/colors';

// Dev-only: prevent a known noisy unhandled rejection from crashing the app
// when Android's Activity is restarting (dev-client / reload race).
declare const __DEV__: boolean;
if (__DEV__ && typeof process !== 'undefined' && typeof process.on === 'function') {
  const key = '__matchpoint_keepawake_unhandled_rejection_handler__';
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[key]) {
    g[key] = true;
    process.on('unhandledRejection', (reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : String(reason ?? '');
      if (
        msg.includes("ExpoKeepAwake.activate") &&
        (msg.includes('current activity is no longer available') || msg.includes('The current activity is no longer available'))
      ) {
        return;
      }
      // Keep default behavior: surface other unhandled rejections.
      // eslint-disable-next-line no-console
      console.error('Unhandled promise rejection', reason);
    });
  }
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

initAppObservability();

if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  import('@/lib/theme/verifyThemeA11y').then(({ verifyThemeA11y }) => {
    // eslint-disable-next-line no-console
    console.log('[theme.a11y]', verifyThemeA11y());
  });
}

export default function RootLayout() {
  // Required for OAuth: closes auth browser when redirect returns to app
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const hasHydrated = useLanguageStore((s) => s._hasHydrated);
  const themeHydrated = useThemeStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated || !language) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if (window.location.pathname.startsWith('/t/')) {
          const l = new URLSearchParams(window.location.search).get('lang');
          if (l === 'en' || l === 'es' || l === 'it') return;
        }
      } catch {
        /* ignore */
      }
    }
    i18n.locale = language;
  }, [hasHydrated, language]);

  // Keep theme in sync with the signed-in user (server persisted).
  useEffect(() => {
    if (!themeHydrated) return;
    const u = useUserStore.getState().user as unknown as { themePresetId?: unknown } | null;
    const raw = u?.themePresetId;
    const presetId = (typeof raw === 'string' ? raw : null) as ThemePresetId | null;
    if (presetId && presetId in THEME_PRESETS) {
      useThemeStore.getState().setPresetId(presetId);
    } else {
      // Ensure we always have a valid preset when store is empty.
      const cur = useThemeStore.getState().presetId;
      if (!cur) useThemeStore.getState().setPresetId(DEFAULT_THEME_PRESET_ID);
    }
  }, [themeHydrated]);

  const Wrapper = Platform.OS === 'web' ? View : GestureHandlerRootView;

  return (
    <Wrapper style={{ flex: 1 }}>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <View style={styles.rootFill}>
            <OfflineBanner />
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <View style={styles.rootFill}>
          <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="language" options={{ headerShown: false }} />
        <Stack.Screen
          name="tournament/[id]"
          options={{
            headerShown: true,
            title: t('common.tournament'),
            headerTintColor: '#e5e5e5',
            headerStyle: { backgroundColor: '#1a1a1a' },
          }}
        />
        <Stack.Screen name="tournament/create" />
        <Stack.Screen name="tournament/[id]/team/create" />
        <Stack.Screen name="t/[token]" />
        <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/my-entries"
          options={{
            headerShown: true,
            title: t('tabs.myEntries'),
            headerTintColor: '#e5e5e5',
            headerStyle: { backgroundColor: '#1a1a1a' },
          }}
        />
        <Stack.Screen
          name="profile/my-data"
          options={{
            headerShown: true,
            title: t('profile.myData'),
            headerTintColor: '#e5e5e5',
            headerStyle: { backgroundColor: '#1a1a1a' },
          }}
        />
        <Stack.Screen
          name="profile/[userId]"
          options={{
            headerShown: true,
            title: t('profile.publicProfileTitle'),
            headerTintColor: '#e5e5e5',
            headerStyle: { backgroundColor: '#1a1a1a' },
          }}
        />
        <Stack.Screen name="profile/change-password" options={{ headerShown: true, title: t('profile.changePassword') }} />
          </Stack>
              </View>
        </ThemeProvider>
          </View>
      </QueryClientProvider>
      </I18nProvider>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  rootFill: { flex: 1 },
});
