import React, { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { authApi } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      Alert.alert(t('common.error'), t('auth.emailRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert(t('common.error'), 'Email inválido');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      Alert.alert(t('common.error'), t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {sent ? (
          <>
            <Text style={styles.title}>✉️</Text>
            <Text style={styles.heading}>{t('auth.checkYourEmail')}</Text>
            <Text style={styles.subtitle}>{t('auth.resetEmailSent')}</Text>
            <Button title={t('auth.backToSignIn')} onPress={() => router.back()} variant="secondary" fullWidth />
          </>
        ) : (
          <>
            <Text style={styles.heading}>{t('auth.forgotPassword')}</Text>
            <Text style={styles.subtitle}>{t('auth.resetInstructions')}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            <Button
              title={loading ? t('auth.sending') : t('auth.sendResetLink')}
              onPress={handleSubmit}
              disabled={loading}
              variant="primary"
              fullWidth
            />

            <Button
              title={t('auth.backToSignIn')}
              onPress={() => router.back()}
              variant="secondary"
              fullWidth
            />
          </>
        )}
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
    gap: 16,
  },
  title: {
    fontSize: 48,
    textAlign: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.yellow,
    textAlign: 'center',
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
});
