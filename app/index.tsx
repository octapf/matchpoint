import React, { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
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

  useEffect(() => {
    if (!hasHydratedUser || !hasHydratedLanguage) return;
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
      <Text style={styles.logo}>Matchpoint</Text>
      <Text style={styles.tagline}>{t('splash.tagline')}</Text>
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
  logo: {
    fontSize: 42,
    fontWeight: '700',
    color: Colors.yellow,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 48,
  },
  copyright: {
    fontSize: 12,
    color: Colors.textMuted,
    position: 'absolute',
    bottom: 48,
  },
});
