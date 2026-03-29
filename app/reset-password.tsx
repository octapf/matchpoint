import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError('');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('passwordReset.errorRules'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordReset.errorMismatch'));
      return;
    }
    if (!token) {
      setError(t('passwordReset.errorTokenInvalid'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/email?action=reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'err');
      setDone(true);
    } catch {
      setError(t('passwordReset.errorLinkExpired'));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.heading}>{t('passwordReset.successHeading')}</Text>
        <Text style={styles.subtitle}>
          {Platform.OS === 'web' ? t('passwordReset.successSubtitleWeb') : t('passwordReset.successSubtitleApp')}
        </Text>
        {Platform.OS === 'web' ? (
          <Pressable
            style={styles.button}
            onPress={() => {
              Linking.openURL('com.miralab.matchpoint://sign-in').catch(() => Linking.openURL(PLAY_STORE_URL));
            }}
          >
            <Text style={styles.buttonText}>{t('passwordReset.openMatchpoint')}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.button} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.buttonText}>{t('passwordReset.goToSignIn')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.heading}>{t('passwordReset.headingNew')}</Text>
        <Text style={styles.subtitle}>{t('passwordReset.subtitleNew')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('passwordReset.placeholderNew')}
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder={t('passwordReset.placeholderConfirm')}
          placeholderTextColor={Colors.textMuted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? t('passwordReset.saving') : t('passwordReset.savePassword')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
    gap: 14,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.yellow,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
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
  error: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.yellow,
    borderRadius: 50,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
