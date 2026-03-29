import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { View, StyleSheet } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { queryClient } from '@/lib/queryClient';
import { I18nProvider, i18n, useTranslation } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';
import { OfflineBanner } from '@/components/OfflineBanner';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Required for OAuth: closes auth browser when redirect returns to app
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded || Platform.OS === 'web') {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // On web, don't block on font loading - useFonts can hang and cause blank screen
  if (!loaded && Platform.OS !== 'web') {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const language = useLanguageStore((s) => s.language);
  const hasHydrated = useLanguageStore((s) => s._hasHydrated);

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
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
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
