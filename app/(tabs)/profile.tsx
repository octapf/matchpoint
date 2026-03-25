import React, { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { getUserDisplayName } from '@/lib/utils/userDisplay';
import type { Gender } from '@/types';

function isAdminUser(role: string | undefined): boolean {
  return role === 'admin';
}
import { LANGUAGES } from '@/lib/i18n';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';

function formatGender(t: (k: string) => string, g?: Gender): string {
  if (!g) return '—';
  return { male: t('profile.genderMale'), female: t('profile.genderFemale') }[g] || g;
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const signOut = useUserStore((s) => s.signOut);
  const language = useLanguageStore((s) => s.language ?? 'en');
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleSignOut = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (_) {}
    signOut();
    router.replace('/(auth)/sign-in');
  };

  const runDeleteAccount = async () => {
    if (!user?._id || !config.api.isConfigured) {
      Alert.alert(t('common.error'), t('profile.deleteAccountFailed'));
      return;
    }
    setDeletingAccount(true);
    try {
      await usersApi.deleteOne(user._id);
      try {
        await GoogleSignin.signOut();
      } catch (_) {}
      signOut();
      router.replace('/(auth)/sign-in');
    } catch (e) {
      Alert.alert(t('common.error'), t('profile.deleteAccountFailed'));
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('profile.deleteAccount'), t('profile.deleteAccountMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void runDeleteAccount() },
    ]);
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{t('profile.noUserData')}</Text>
        <Button title={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <Avatar
            firstName={user.firstName || ''}
            lastName={user.lastName || ''}
            gender={user.gender}
            size="lg"
          />
          <Text style={styles.name}>{getUserDisplayName(user) || '—'}</Text>
          <Text style={styles.email}>{user.email || '—'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('profile.displayName')}</Text>
          <Text style={styles.value}>{user.displayName || '—'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>{t('profile.firstName')}</Text>
          <Text style={styles.value}>{user.firstName || '—'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>{t('profile.lastName')}</Text>
          <Text style={styles.value}>{user.lastName || '—'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>{t('profile.gender')}</Text>
          <Text style={styles.value}>{formatGender(t, user.gender)}</Text>
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

        <View style={styles.editSection}>
          <Button title={t('profile.editProfile')} onPress={() => router.push('/profile/edit')} variant="outline" fullWidth />
          {user.authProvider === 'email' && (
            <Button title={t('profile.changePassword')} onPress={() => router.push('/profile/change-password' as never)} variant="outline" fullWidth />
          )}
          {isAdminUser(user.role) ? (
            <View style={styles.spacer}>
              <Button
                title={t('profile.openAdmin')}
                variant="secondary"
                onPress={() => router.push('/admin' as never)}
                fullWidth
              />
            </View>
          ) : null}
        </View>

        <View style={styles.buttonsSection}>
          <Button
            title={t('auth.signOut')}
            onPress={handleSignOut}
            fullWidth
            disabled={deletingAccount}
          />
          <View style={styles.spacer} />
          <Button
            title={deletingAccount ? t('profile.deleteAccountDeleting') : t('profile.deleteAccount')}
            onPress={handleDeleteAccount}
            variant="danger"
            fullWidth
            disabled={deletingAccount}
          />
        </View>

        <Text style={styles.footer}>{t('profile.matchpointBy')}</Text>
        <Text style={styles.copyright}>{t('footer.copyright')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  buttonsSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: Colors.text,
  },
  editSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  spacer: {
    height: 12,
  },
  footer: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
  copyright: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
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
});
