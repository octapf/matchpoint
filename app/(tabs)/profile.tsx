import React, { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { NotificationsInboxButton } from '@/components/notifications/NotificationsInboxButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ThemePresetSelect } from '@/components/ui/ThemePresetSelect';
import { AppBackgroundGradient } from '@/components/ui/AppBackgroundGradient';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { getUserDisplayName } from '@/lib/utils/userDisplay';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import { useThemeStore } from '@/store/useThemeStore';
import type { ThemePresetId } from '@/lib/theme/colors';
import { useTheme } from '@/lib/theme/useTheme';

function isAdminUser(role: string | undefined): boolean {
  return role === 'admin';
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Math.max(insets.top, 12) + 8;
  const user = useUserStore((s) => s.user);
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const setUser = useUserStore((s) => s.setUser);
  const signOut = useUserStore((s) => s.signOut);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const setPresetId = useThemeStore((s) => s.setPresetId);

  const handleSignOut = async () => {
    try {
      await GoogleSignin.signOut();
    } catch {}
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
      } catch {}
      signOut();
      router.replace('/(auth)/sign-in');
    } catch {
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

  const persistThemePreset = async (presetId: ThemePresetId) => {
    if (!user?._id || !config.api.isConfigured) {
      setPresetId(presetId);
      return;
    }
    setSavingTheme(true);
    try {
      // Optimistic UI
      setPresetId(presetId);
      const updated = (await usersApi.updateOne(user._id, { themePresetId: presetId })) as typeof user;
      setUser({ ...user, ...updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save theme';
      // If the client is ahead of the deployed backend schema, the server may reject the payload
      // with "No valid fields to update". Keep the local preset and avoid noisy alerts.
      if (msg === 'No valid fields to update') return;
      Alert.alert(t('common.error'), msg);
    } finally {
      setSavingTheme(false);
    }
  };

  if (!hasHydrated) {
    return (
      <View style={styles.container}>
        <AppBackgroundGradient />
        <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('profile.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
        </View>
        <View style={[styles.content, styles.contentBelowSticky]}>
          <View style={styles.hydrateSkeleton}>
            <Skeleton height={80} width={80} borderRadius={40} style={{ marginBottom: 16 }} />
            <Skeleton height={22} width="55%" style={{ marginBottom: 8 }} />
            <Skeleton height={14} width="70%" style={{ marginBottom: 28 }} />
            <Skeleton height={52} width="100%" borderRadius={14} style={{ marginBottom: 12 }} />
            <Skeleton height={52} width="100%" borderRadius={14} />
          </View>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <AppBackgroundGradient />
        <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('profile.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
        </View>
        <View style={[styles.noUserOuter, styles.noUserBody]}>
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('profile.noUserData')}</Text>
            <Button title={t('auth.signIn')} onPress={() => router.replace('/(auth)/sign-in')} size="sm" fullWidth />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <AppBackgroundGradient />
        <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('profile.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, styles.contentBelowSticky]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
        <Pressable
          style={styles.avatarSection}
          onPress={() => router.push(`/profile/${user._id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.viewProfile')}
        >
          <Avatar
            firstName={user.firstName || ''}
            lastName={user.lastName || ''}
            gender={user.gender}
            size="lg"
            photoUrl={user.photoUrl}
          />
          <Text style={styles.name}>
            {(() => {
              const raw = (getUserDisplayName(user) || '').trim();
              if (!raw) return '—';
              return raw.charAt(0).toLocaleUpperCase() + raw.slice(1);
            })()}
          </Text>
          <Text style={styles.email}>{user.email || '—'}</Text>
        </Pressable>

        <Pressable
          style={styles.menuRow}
          onPress={() => router.push('/profile/my-entries' as never)}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.myEntries')}
        >
          <Ionicons name="trophy-outline" size={18} color={tokens.accent} />
          <Text style={styles.menuRowText}>{t('tabs.myEntries')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.menuRow}
          onPress={() => router.push('/profile/my-data' as never)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.myData')}
        >
          <Ionicons name="id-card-outline" size={18} color={tokens.accent} />
          <Text style={styles.menuRowText}>{t('profile.myData')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <View style={styles.themeSection}>
          <ThemePresetSelect
            label="Theme"
            onChange={(id) => {
              void persistThemePreset(id);
            }}
          />
          {savingTheme ? <Text style={styles.themeHint}>Saving…</Text> : null}
        </View>

        {isAdminUser(user.role) ? (
          <Pressable
            style={[
              styles.menuRow,
              styles.menuRowAdmin,
              { backgroundColor: tokens.accentMuted, borderColor: tokens.accentOutline },
            ]}
            onPress={() => router.push('/admin' as never)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.openAdmin')}
          >
            <Ionicons name="settings-outline" size={18} color={tokens.accentHover} />
            <Text style={[styles.menuRowText, styles.menuRowTextAdmin]}>{t('profile.openAdmin')}</Text>
            <Ionicons name="chevron-forward" size={18} color={tokens.accentOutline} />
          </Pressable>
        ) : null}

        <View style={styles.actionsColumn}>
          <Button
            title={t('auth.signOut')}
            onPress={handleSignOut}
            size="sm"
            fullWidth
            disabled={deletingAccount}
          />
          <Button
            title={deletingAccount ? t('profile.deleteAccountDeleting') : t('profile.deleteAccount')}
            onPress={handleDeleteAccount}
            variant="danger"
            size="sm"
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
    backgroundColor: 'transparent',
  },
  stickyScreenHeader: {
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    zIndex: 2,
  },
  contentBelowSticky: {
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  actionsColumn: {
    marginTop: 24,
    marginBottom: 8,
    gap: 12,
  },
  themeSection: {
    marginTop: 18,
    marginBottom: 6,
  },
  themeHint: {
    marginTop: -8,
    marginBottom: 6,
    fontSize: 12,
    color: Colors.textMuted,
  },
  noUserOuter: {
    paddingHorizontal: 16,
  },
  noUserBody: {
    flex: 1,
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 48,
  },
  hydrateSkeleton: {
    alignItems: 'center',
    paddingTop: 8,
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  menuRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  menuRowAdmin: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceLight,
  },
  menuRowTextAdmin: {
    color: '#ffffff',
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
});
