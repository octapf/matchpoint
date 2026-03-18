import React, { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  function set(field: keyof typeof form) {
    return (value: string) => setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSignUp() {
    const { firstName, lastName, username, email, password, confirmPassword } = form;
    if (!firstName || !lastName || !username || !email || !password) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('auth.passwordsMismatch'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      const user = (await authApi.signUp({ firstName, lastName, username, email, password })) as User;
      setUser(user);
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.signUpFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.createAccount')}</Text>
        <Text style={styles.subtitle}>{t('auth.joinMatchpoint')}</Text>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('auth.firstName')}
            placeholderTextColor={Colors.textMuted}
            value={form.firstName}
            onChangeText={set('firstName')}
            autoCapitalize="words"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('auth.lastName')}
            placeholderTextColor={Colors.textMuted}
            value={form.lastName}
            onChangeText={set('lastName')}
            autoCapitalize="words"
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder={t('auth.username')}
          placeholderTextColor={Colors.textMuted}
          value={form.username}
          onChangeText={set('username')}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          placeholderTextColor={Colors.textMuted}
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('auth.password')}
            placeholderTextColor={Colors.textMuted}
            value={form.password}
            onChangeText={set('password')}
            secureTextEntry={!showPassword}
          />
          <Pressable style={styles.eyeButton} onPress={() => setShowPassword(v => !v)}>
            <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder={t('auth.confirmPassword')}
          placeholderTextColor={Colors.textMuted}
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
          secureTextEntry={!showPassword}
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
        />

        <Button
          title={loading ? t('auth.creatingAccount') : t('auth.signUp')}
          onPress={handleSignUp}
          disabled={loading}
          variant="primary"
          fullWidth
        />

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>{t('auth.alreadyHaveAccount')} </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.loginLink}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>
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
    gap: 14,
  },
  title: {
    fontSize: 28,
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
  row: {
    flexDirection: 'row',
    gap: 10,
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
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginText: { color: Colors.textSecondary, fontSize: 14 },
  loginLink: { color: Colors.yellow, fontSize: 14, fontWeight: '600' },
});
