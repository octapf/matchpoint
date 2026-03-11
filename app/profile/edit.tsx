import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Gender } from '@/types';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '');
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setGender((user.gender as Gender) || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user?._id || !config.api.isConfigured) {
      Alert.alert(t('common.error'), t('editProfile.cannotSave'));
      return;
    }
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
      const updatePayload: Record<string, unknown> = {
        displayName: displayName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender as Gender,
      };
      const updated = (await usersApi.updateOne(user._id, updatePayload)) as typeof user;
      setUser({ ...updated, ...updatePayload });
      router.back();
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('editProfile.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('editProfile.title')}</Text>

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
        <Text style={styles.hint}>{t('profile.displayNameHint')}</Text>
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
        <Text style={styles.label}>Last name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your last name"
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

      <Button title={t('common.save')} onPress={handleSave} disabled={saving} fullWidth />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  genderRow: { flexDirection: 'row', gap: 12 },
  genderBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  genderBtnActive: { backgroundColor: Colors.yellow },
  genderBtnInactive: { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.surfaceLight },
  genderBtnText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  genderBtnTextActive: { color: '#1a1a1a' },
});
