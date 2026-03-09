import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { config } from '@/lib/config';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

// Must use package name as scheme - Google requires it for Android OAuth client
const GOOGLE_REDIRECT_URI =
  Platform.OS === 'android' ? 'com.miralab.matchpoint:/oauthredirect' : undefined;

export default function SignInScreen() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);

  // Required: closes the auth browser tab when redirect returns to app
  React.useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: config.google.clientId,
    androidClientId: config.google.androidClientId,
    ...(GOOGLE_REDIRECT_URI && { redirectUri: GOOGLE_REDIRECT_URI }),
  });

  React.useEffect(() => {
    if (!response) return;
    if (response.type === 'success' && response.params?.id_token) {
      handleGoogleToken(response.params.id_token);
    } else if (response.type === 'error') {
      setLoading(false);
      Alert.alert('Error', 'Google sign-in was cancelled or failed.');
    }
  }, [response]);

  async function handleGoogleToken(idToken: string) {
    try {
      const user = (await authApi.signInWithGoogle(idToken)) as User;
      setUser(user);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGooglePress() {
    if (!config.google.isConfigured) {
      Alert.alert('Not configured', 'Google sign-in is not configured. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID to .env');
      return;
    }
    setLoading(true);
    try {
      await promptAsync();
      if (response?.type !== 'success') setLoading(false);
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open Google sign-in');
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
