import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import { useUserStore } from '@/store/useUserStore';
import type { Gender, User, UserRole } from '@/types';

export default function AdminEditUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const sessionUser = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [role, setRole] = useState<UserRole>('user');
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    if (!id || !config.api.isConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const u = (await usersApi.findOne({ id })) as User;
      setEmail(u.email ?? '');
      setDisplayName(u.displayName ?? '');
      setFirstName(u.firstName ?? '');
      setLastName(u.lastName ?? '');
      setGender((u.gender as Gender) || '');
      setRole(u.role === 'admin' ? 'admin' : 'user');
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : 'Failed');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleSave = async () => {
    if (!id || !config.api.isConfigured) return;
    if (!firstName.trim()) {
      Alert.alert(t('common.error'), t('editProfile.missingFirstName'));
      return;
    }
    if (!gender || (gender !== 'male' && gender !== 'female')) {
      Alert.alert(t('common.error'), t('editProfile.genderRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName: displayName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender as Gender,
        role,
      };
      const updated = (await usersApi.updateOne(id, payload)) as User;
      if (sessionUser?._id === id) {
        setUser({ ...sessionUser, ...updated });
      }
      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('editProfile.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !email) {
    return (
      <>
        <Stack.Screen options={{ title: t('admin.editUserTitle') }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.yellow} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('admin.editUserTitle') }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.emailReadOnly')}</Text>
          <Text style={styles.readonly}>{email || '—'}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.displayName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.displayNamePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.firstName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('profile.firstNamePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.lastName')}</Text>
          <TextInput
            style={styles.input}
            placeholder="—"
            placeholderTextColor={Colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('profile.gender')}</Text>
          <View style={styles.genderRow}>
            {(['male', 'female'] as const).map((g) => (
              <Pressable
                key={g}
                onPress={() => setGender(g)}
                style={[
                  styles.genderBtn,
                  gender === g ? styles.genderBtnActive : styles.genderBtnInactive,
                ]}
              >
                <Text style={[styles.genderBtnText, gender === g && styles.genderBtnTextActive]}>
                  {t(`profile.gender${g === 'male' ? 'Male' : 'Female'}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.roleLabel')}</Text>
          <View style={styles.genderRow}>
            {(['user', 'admin'] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={[styles.genderBtn, role === r ? styles.genderBtnActive : styles.genderBtnInactive]}
              >
                <Text style={[styles.genderBtnText, role === r && styles.genderBtnTextActive]}>
                  {r === 'admin' ? t('admin.badgeAdmin') : t('admin.badgeUser')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {id ? (
          <Text style={styles.idFooter} selectable>
            ID: {id}
          </Text>
        ) : null}

        <Button title={t('common.save')} onPress={() => void handleSave()} disabled={saving} fullWidth />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  readonly: {
    fontSize: 16,
    color: Colors.textMuted,
    paddingVertical: 4,
  },
  genderRow: { flexDirection: 'row', gap: 12 },
  genderBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  genderBtnActive: { backgroundColor: Colors.yellow },
  genderBtnInactive: { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.surfaceLight },
  genderBtnText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  genderBtnTextActive: { color: '#1a1a1a' },
  idFooter: { fontSize: 12, color: Colors.textMuted, marginBottom: 20 },
});
