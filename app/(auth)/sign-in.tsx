import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Platform, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { config } from '@/lib/config';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const setUser = useUserStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const nextRoute = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/(tabs)';

  useEffect(() => {
    if (Platform.OS !== 'web') {
      GoogleSignin.configure({
        webClientId: config.google.clientId,
        offlineAccess: false,
      });
    }
  }, []);

  async function handleGooglePress() {
    if (!config.google.isConfigured) {
      Alert.alert(t('common.error'), t('auth.googleNotConfigured'));
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
        router.replace(nextRoute as never);
      } else {
        Alert.alert(t('common.error'), t('auth.googleTokenMissing'));
      }
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.googleSignInFailed'));
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
        Alert.alert(t('common.error'), t('auth.appleTokenMissing'));
        return;
      }
      setLoading(true);
      const user = (await authApi.signInWithApple(credential.identityToken, {
        firstName: credential.fullName?.givenName ?? undefined,
        lastName: credential.fullName?.familyName ?? undefined,
      })) as User;
      setUser(user);
      router.replace(nextRoute as never);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.appleSignInFailed'));
    } finally {
      setLoading(false);
    }
  }

  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

  // Web: Google/Apple Sign-In not supported — show "Open in app"
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>Matchpoint</Text>
        <Text style={styles.subtitle}>{t('auth.webSignInOnly')}</Text>
        <Button
          title={t('auth.getOnPlayStore')}
          onPress={() => Linking.openURL(PLAY_STORE_URL)}
          fullWidth
        />
        <Text style={styles.footer}>{t('footer.copyright')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Matchpoint</Text>
      <Text style={styles.subtitle}>{t('auth.signInToJoin')}</Text>

      <View style={styles.buttons}>
        <Button
          title={loading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
          onPress={handleGooglePress}
          disabled={loading}
          variant="primary"
          fullWidth
        />
        {Platform.OS === 'ios' && (
          <>
            <View style={styles.spacer} />
            <Button
              title={t('auth.continueWithApple')}
              onPress={handleApplePress}
              disabled={loading}
              variant="secondary"
              fullWidth
            />
          </>
        )}
      </View>

      <Text style={styles.footer}>{t('footer.copyright')}</Text>
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
