import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';

export default function SplashScreen() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const hasHydrated = useUserStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    const t = setTimeout(() => {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [hasHydrated, user, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Matchpoint</Text>
      <Text style={styles.tagline}>Beach volleyball tournaments</Text>
      <Text style={styles.copyright}>© 2026 Miralab</Text>
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
