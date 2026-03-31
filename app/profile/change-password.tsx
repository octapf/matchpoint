import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { authApi } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useUserStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!currentPassword) return t('passwordChange.errorCurrentRequired');
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return t('passwordChange.errorNewRules');
    }
    if (newPassword !== confirmPassword) return t('passwordChange.errorMismatch');
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert(t('common.error'), err);
      return;
    }
    if (!user?._id) return;
    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      Alert.alert(t('common.done'), t('passwordChange.successMessage'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('passwordChange.updateFailed'));
    } finally {
      setLoading(false);
    }
  }

  if (!user || user.authProvider !== 'email') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('passwordChange.emailOnly')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('passwordChange.screenTitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('passwordChange.currentPassword')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={t('passwordChange.placeholderMask')}
              placeholderTextColor={Colors.textMuted}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowCurrent((s) => !s)} style={styles.eyeBtn}>
              <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('passwordChange.newPassword')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={t('passwordChange.placeholderRules')}
              placeholderTextColor={Colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowNew((s) => !s)} style={styles.eyeBtn}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('passwordChange.confirmPassword')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('passwordChange.placeholderMask')}
            placeholderTextColor={Colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? t('passwordChange.saving') : t('passwordChange.save')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, height: 44, paddingHorizontal: 12, fontSize: 14, color: Colors.text, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingRight: 10 },
  eyeBtn: { padding: 8 },
  button: { backgroundColor: Colors.yellow, borderRadius: 50, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.background, fontSize: 14, fontWeight: '800' },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginTop: 24 },
});
