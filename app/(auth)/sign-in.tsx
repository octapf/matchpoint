import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { config } from '@/lib/config';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

export default function SignInScreen() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: config.google.clientId,
      offlineAccess: false,
    });
  }, []);

  async function handleGooglePress() {
    if (!config.google.isConfigured) {
      Alert.alert('Not configured', 'Google sign-in is not configured. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID to .env');
      return;
    }
    setLoading(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled') {
        setLoading(false);
        return;
      }
      if (result.type === 'success' && result.data?.idToken) {
        const user = (await authApi.signInWithGoogle(result.data.idToken)) as User;
        setUser(user);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Error', 'Could not get token from Google');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleApplePress() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('Error', 'Apple did not return an identity token');
        return;
      }
      setLoading(true);
      const user = (await authApi.signInWithApple(credential.identityToken, {
        firstName: credential.fullName?.givenName ?? undefined,
        lastName: credential.fullName?.familyName ?? undefined,
      })) as User;
      setUser(user);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Error', err instanceof Error ? err.message : 'Apple sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Matchpoint</Text>
      <Text style={styles.subtitle}>Sign in to join tournaments</Text>

      <View style={styles.buttons}>
        <Button
          title={loading ? 'Signing in...' : 'Continue with Google'}
          onPress={handleGooglePress}
          disabled={loading}
          variant="primary"
          fullWidth
        />
        {Platform.OS === 'ios' && (
          <>
            <View style={styles.spacer} />
            <Button
              title="Continue with Apple"
              onPress={handleApplePress}
              disabled={loading}
              variant="secondary"
              fullWidth
            />
          </>
        )}
      </View>

      <Text style={styles.footer}>© 2026 Miralab</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.yellow,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 48,
  },
  buttons: {
    gap: 16,
  },
  spacer: {
    height: 12,
  },
  footer: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 48,
  },
});
