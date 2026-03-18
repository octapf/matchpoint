import React, { useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';

export default function SplashScreen() {
  const { t } = useTranslation();
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
    // On web, only redirect if we're actually on the index route
    if (Platform.OS === 'web' && pathname !== '/') return;
    const timeoutId = setTimeout(() => {
      if (!hasSelectedLanguage) {
        router.replace('/language');
        return;
      }
      if (user) {
        router.replace('/(tabs)');
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
          <Text style={styles.wordmarkMatch}>MATCH</Text>
          <Text style={styles.wordmarkPoint}>POINT</Text>
        </View>
        <Text style={styles.slogan}>Play it as it is.</Text>
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
    color: Colors.yellow,
    letterSpacing: -1,
  },
  wordmarkPoint: {
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.violet,
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
