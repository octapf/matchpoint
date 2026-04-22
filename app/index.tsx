import React, { useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { useTheme } from '@/lib/theme/useTheme';

export default function SplashScreen() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const hasHydratedUser = useUserStore((s) => s._hasHydrated);
  const hasHydratedLanguage = useLanguageStore((s) => s._hasHydrated);
  const hasSelectedLanguage = useLanguageStore((s) => s.hasSelectedLanguage);

  const pathname = usePathname();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!hasHydratedUser || !hasHydratedLanguage) return;
    // On web, don't redirect if we're on a specific route
    if (Platform.OS === 'web' && pathname !== '/' && pathname !== '') return;
    // Session expiry: if user has sessionExpiresAt and it's past, sign out
    const u = useUserStore.getState().user as { sessionExpiresAt?: number } | null;
    if (u?.sessionExpiresAt && Date.now() > u.sessionExpiresAt) {
      useUserStore.getState().signOut();
    }
    const timeoutId = setTimeout(() => {
      if (!hasSelectedLanguage) {
        router.replace('/language');
        return;
      }
      const { user: currentUser, accessToken } = useUserStore.getState();
      if (currentUser && !accessToken) {
        useUserStore.getState().signOut();
        router.replace('/(auth)/sign-in');
        return;
      }
      if (currentUser) {
        router.replace('/(tabs)/feed');
      } else {
        router.replace('/(auth)/sign-in');
      }
    }, 1200);
    return () => clearTimeout(timeoutId);
  }, [hasHydratedUser, hasHydratedLanguage, hasSelectedLanguage, user, router]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity, transform: [{ translateY }] }}>
        <View style={styles.wordmarkRow}>
          <Text style={[styles.wordmarkMatch, { color: tokens.accent }]}>{t('auth.brandWordMatch')}</Text>
          <Text style={[styles.wordmarkPoint, { color: tokens.accentHover }]}>{t('auth.brandWordPoint')}</Text>
        </View>
        <Text style={styles.slogan}>{t('auth.brandTagline')}</Text>
      </Animated.View>
      <Text style={styles.copyright}>{t('footer.copyright')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmarkMatch: {
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.text,
    letterSpacing: -1,
  },
  wordmarkPoint: {
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.text,
    letterSpacing: -1,
  },
  slogan: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: -6,
    letterSpacing: 0.3,
    textAlign: 'right',
  },
  copyright: {
    fontSize: 11,
    color: Colors.textSecondary,
    position: 'absolute',
    bottom: 48,
  },
});
