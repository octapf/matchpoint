import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Platform, Alert, Linking, Image, Pressable, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { config } from '@/lib/config';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

type AuthTab = 'google' | 'email';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const setUser = useUserStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<AuthTab>('google');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      if (result.type === 'cancelled') { setLoading(false); return; }
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

  async function handleEmailLogin() {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }
    setLoading(true);
    try {
      const user = (await authApi.login(identifier.trim(), password)) as User;
      setUser(user);
      router.replace(nextRoute as never);
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>Matchpoint</Text>
        <Text style={styles.subtitle}>{t('auth.webSignInOnly')}</Text>
        <Button title={t('auth.getOnPlayStore')} onPress={() => Linking.openURL(PLAY_STORE_URL)} fullWidth />
        <Text style={styles.footer}>{t('footer.copyright')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Image
          source={require('@/assets/images/matchpoint-icon-512.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.logo}>Matchpoint</Text>
        <Text style={styles.subtitle}>{t('auth.signInToJoin')}</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, tab === 'google' && styles.tabActive]} onPress={() => setTab('google')}>
            <Text style={[styles.tabText, tab === 'google' && styles.tabTextActive]}>Google</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'email' && styles.tabActive]} onPress={() => setTab('email')}>
            <Text style={[styles.tabText, tab === 'email' && styles.tabTextActive]}>Email</Text>
          </Pressable>
        </View>

        <View style={styles.buttons}>
          {tab === 'google' ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed, loading && styles.googleButtonDisabled]}
                onPress={handleGooglePress}
                disabled={loading}
              >
                <Image source={require('@/assets/images/google-logo-transparent.png')} style={styles.googleLogo} />
                <Text style={styles.googleButtonText}>
                  {loading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
                </Text>
              </Pressable>

              {Platform.OS === 'ios' && (
                <Button
                  title={t('auth.continueWithApple')}
                  onPress={handleApplePress}
                  disabled={loading}
                  variant="secondary"
                  fullWidth
                />
              )}
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailOrUsername')}
                placeholderTextColor={Colors.textMuted}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t('auth.password')}
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleEmailLogin}
                />
                <Pressable style={styles.eyeButton} onPress={() => setShowPassword(v => !v)}>
                  <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
                </Pressable>
              </View>

              <Button
                title={loading ? t('auth.signingIn') : t('auth.signIn')}
                onPress={handleEmailLogin}
                disabled={loading}
                variant="primary"
                fullWidth
              />

              <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
                <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>{t('auth.noAccount')} </Text>
          <Link href="/(auth)/sign-up">
            <Text style={styles.signupLink}>{t('auth.signUp')}</Text>
          </Link>
        </View>

        <Text style={styles.footer}>{t('footer.copyright')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  logoImage: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 16,
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
    marginBottom: 32,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.yellow,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#000',
  },
  buttons: {
    gap: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131314',
    borderRadius: 50,
    height: 52,
    paddingHorizontal: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#8e918f',
  },
  googleButtonPressed: { backgroundColor: '#1e1e1e' },
  googleButtonDisabled: { opacity: 0.6 },
  googleLogo: { width: 22, height: 22, resizeMode: 'contain' },
  googleButtonText: { color: '#e3e3e3', fontSize: 15, fontWeight: '600', letterSpacing: 0.25 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeButton: {
    height: 52,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  eyeText: { fontSize: 18 },
  forgotText: {
    color: Colors.yellow,
    textAlign: 'center',
    fontSize: 14,
    marginTop: 4,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  signupText: { color: Colors.textSecondary, fontSize: 14 },
  signupLink: { color: Colors.yellow, fontSize: 14, fontWeight: '600' },
  footer: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
