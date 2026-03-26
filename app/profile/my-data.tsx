import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { LANGUAGES } from '@/lib/i18n';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import { queryClient } from '@/lib/queryClient';
import type { Gender, User } from '@/types';
import { normalizeUsername, isValidUsername } from '@/lib/validation/username';

const SAVE_DEBOUNCE_MS = 750;

function profileMatchesUser(
  u: User,
  username: string,
  firstName: string,
  lastName: string,
  gender: Gender | '',
  phone: string,
  phoneVisible: boolean
): boolean {
  const normalized = normalizeUsername(username);
  const serverHandle = normalizeUsername(u.username ?? u.displayName ?? '');
  /** While the field is invalid or empty, do not block saving other fields. */
  const usernameInSync =
    !isValidUsername(normalized) || serverHandle === normalized;

  return (
    usernameInSync &&
    (u.firstName ?? '') === firstName.trim() &&
    (u.lastName ?? '') === lastName.trim() &&
    (u.gender ?? '') === gender &&
    (u.phone ?? '') === phone.trim() &&
    (u.phoneVisible ?? false) === phoneVisible
  );
}

export default function MyDataScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const language = useLanguageStore((s) => s.language ?? 'en');
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [phone, setPhone] = useState('');
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!user) return;
    setUsername(user.username ?? user.displayName ?? '');
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setGender((user.gender as Gender) || '');
    setPhone(user.phone ?? '');
    setPhoneVisible(user.phoneVisible ?? false);
  }, [user]);

  const persist = useCallback(
    async (genderOverride?: Gender, phoneVisibleOverride?: boolean) => {
      if (!user?._id || !config.api.isConfigured) return;
      const g = genderOverride ?? gender;
      const pv = phoneVisibleOverride !== undefined ? phoneVisibleOverride : phoneVisible;
      if (!firstName.trim()) return;
      if (!g || (g !== 'male' && g !== 'female')) return;

      const normalized = normalizeUsername(username);
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: g,
        phone: phone.trim() ? phone.trim() : '',
        phoneVisible: pv,
      };
      if (isValidUsername(normalized)) {
        payload.username = normalized;
      }

      if (profileMatchesUser(user, username, firstName, lastName, g, phone, pv)) return;

      setSaving(true);
      try {
        const updated = (await usersApi.updateOne(user._id, payload)) as typeof user;
        setUser({ ...user, ...updated });
        void queryClient.invalidateQueries({ queryKey: ['user', user._id] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'Username already taken') {
          Alert.alert(t('common.error'), t('editProfile.usernameTaken'));
        } else {
          Alert.alert(t('common.error'), msg || t('editProfile.failedToSave'));
        }
      } finally {
        setSaving(false);
      }
    },
    [user, username, firstName, lastName, gender, phone, phoneVisible, setUser, t]
  );

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      saveFnRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const flushSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveFnRef.current();
  }, []);

  useEffect(() => {
    saveFnRef.current = () => {
      void persist();
    };
  }, [persist]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{t('profile.noUserData')}</Text>
        <Button title={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.field}>
        <Text style={styles.label}>{t('profile.username')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('profile.usernamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={username}
          onChangeText={(v) => {
            setUsername(v);
            scheduleSave();
          }}
          onBlur={() => {
            setUsername((u: string) => normalizeUsername(u));
            flushSave();
          }}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>{t('profile.usernameHint')}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('profile.firstName')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('profile.firstNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={firstName}
          onChangeText={(v) => {
            setFirstName(v);
            scheduleSave();
          }}
          onBlur={flushSave}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('profile.lastName')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('profile.lastNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={lastName}
          onChangeText={(v) => {
            setLastName(v);
            scheduleSave();
          }}
          onBlur={flushSave}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('profile.phone')}</Text>
        <PhoneInput
          value={phone}
          onChange={(v) => {
            setPhone(v);
            scheduleSave();
          }}
        />
        <Text style={styles.hint}>{t('editProfile.phoneHint')}</Text>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchRowText}>
          <Text style={styles.label}>{t('profile.phoneVisibleLabel')}</Text>
          <Text style={styles.hint}>{t('profile.phoneVisibleHint')}</Text>
        </View>
        <Switch
          value={phoneVisible}
          trackColor={{ false: Colors.surfaceLight, true: Colors.yellow }}
          thumbColor="#f4f4f5"
          onValueChange={(v) => {
            setPhoneVisible(v);
            setTimeout(() => void persist(undefined, v), 0);
          }}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('profile.gender')}</Text>
        <View style={styles.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => {
                setGender(g);
                setTimeout(() => void persist(g), 0);
              }}
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

      <View style={styles.section}>
        <Text style={styles.label}>{t('settings.language')}</Text>
        <View style={styles.langSegment}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              onPress={() => setLanguage(lang)}
              style={({ pressed }) => [
                styles.langPill,
                language === lang && styles.langPillActive,
                pressed && styles.langPillPressed,
              ]}
            >
              <Text style={[styles.langPillText, language === lang && styles.langPillTextActive]}>
                {lang.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {saving ? (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={Colors.yellow} />
          <Text style={styles.savingText}>{t('editProfile.saving')}</Text>
        </View>
      ) : null}

      <View style={styles.actionsColumn}>
        {user.authProvider === 'email' ? (
          <Button
            title={t('profile.changePassword')}
            onPress={() => router.push('/profile/change-password' as never)}
            variant="outline"
            fullWidth
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  field: {
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    paddingVertical: 4,
  },
  switchRowText: {
    flex: 1,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  genderBtnActive: {
    backgroundColor: Colors.yellow,
  },
  genderBtnInactive: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  genderBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  genderBtnTextActive: {
    color: '#1a1a1a',
  },
  langSegment: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  langPill: {
    flex: 1,
    flexBasis: 0,
    minHeight: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillActive: {
    backgroundColor: Colors.yellow,
  },
  langPillPressed: {
    opacity: 0.85,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  langPillTextActive: {
    color: '#1a1a1a',
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  savingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  actionsColumn: {
    marginTop: 8,
    gap: 12,
  },
});
