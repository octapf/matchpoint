import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  View, Text, StyleSheet, Platform, Alert, Linking,
  Image, Pressable, TextInput, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
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
        <Text style={styles.logoText}>Matchpoint</Text>
        <Text style={styles.subtitle}>{t('auth.webSignInOnly')}</Text>
        <Pressable style={styles.primaryButton} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
          <Text style={styles.primaryButtonText}>{t('auth.getOnPlayStore')}</Text>
        </Pressable>
        <Text style={styles.footer}>{t('footer.copyright')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('@/assets/images/matchpoint-icon-512.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View style={styles.wordmarkRow}>
            <Text style={styles.wordmarkMatch}>MATCH</Text>
            <Text style={styles.wordmarkPoint}>POINT</Text>
          </View>
        </View>

        {/* Email / password form */}
        <View style={styles.form}>
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

          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('auth.password')}
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleEmailLogin}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.textMuted}
              />
            </Pressable>
          </View>

          <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
            <Text style={styles.forgotText}>{t('auth.recoverPassword')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, (pressed || loading) && styles.primaryButtonPressed]}
            onPress={handleEmailLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orSignInWith')}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons */}
        <View style={styles.socialSection}>
          <Pressable
            style={({ pressed }) => [styles.googleButton, (pressed || loading) && styles.googleButtonPressed]}
            onPress={handleGooglePress}
            disabled={loading}
          >
            <Image
              source={require('@/assets/images/google-logo-transparent.png')}
              style={styles.googleLogo}
            />
            <Text style={styles.googleButtonText}>
              {loading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
            </Text>
          </Pressable>

          {Platform.OS === 'ios' && (
            <Pressable
              style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
              onPress={handleApplePress}
              disabled={loading}
            >
              <Ionicons name="logo-apple" size={22} color="#e3e3e3" />
              <Text style={styles.googleButtonText}>{t('auth.continueWithApple')}</Text>
            </Pressable>
          )}
        </View>

        {/* Sign up */}
        <Pressable
          style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
          onPress={() => router.push('/(auth)/sign-up')}
        >
          <Text style={styles.outlineButtonText}>{t('auth.register')}</Text>
        </Pressable>

        {/* Terms */}
        <Pressable onPress={() => Linking.openURL('https://www.miralab.ar/es/matchpoint/privacy')}>
          <Text style={styles.termsText}>{t('auth.termsAndConditions')}</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoImage: {
    width: 90,
    height: 90,
    marginBottom: 12,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmarkMatch: {
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.yellow,
    letterSpacing: -0.5,
  },
  wordmarkPoint: {
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.violet,
    letterSpacing: -0.5,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.yellow,
  },
  form: {
    gap: 14,
    marginBottom: 28,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  eyeBtn: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotText: {
    color: Colors.yellow,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: Colors.yellow,
    borderRadius: 50,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceLight,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  socialSection: {
    gap: 12,
    marginBottom: 16,
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
  googleButtonPressed: {
    backgroundColor: '#1e1e1e',
  },
  googleLogo: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  googleButtonText: {
    color: '#e3e3e3',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.25,
  },
  outlineButton: {
    borderRadius: 50,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.text,
    marginBottom: 24,
  },
  outlineButtonPressed: {
    opacity: 0.7,
  },
  outlineButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  termsText: {
    color: Colors.yellow,
    textAlign: 'center',
    fontSize: 13,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  footer: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
});
