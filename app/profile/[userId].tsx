import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';
import { useUser } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { getUserDisplayName } from '@/lib/utils/userDisplay';
import { formatPhoneDisplay } from '@/lib/phone/phone';
import type { Gender } from '@/types';

function formatGender(t: (k: string) => string, g?: Gender): string {
  if (!g) return '—';
  return { male: t('profile.genderMale'), female: t('profile.genderFemale') }[g] || g;
}

export default function PublicProfileScreen() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);
  const { data: profile, isLoading, isError, error } = useUser(userId);

  if (me?._id && userId && me._id === userId) {
    return <Redirect href="/profile/my-data" />;
  }

  if (!userId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{t('profile.userNotFound')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.yellow} />
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{error instanceof Error ? error.message : t('profile.userNotFound')}</Text>
      </View>
    );
  }

  const phone = profile.phone ?? '';
  const showPhone = phone.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar
          firstName={profile.firstName ?? ''}
          lastName={profile.lastName ?? ''}
          gender={profile.gender === 'male' || profile.gender === 'female' ? profile.gender : undefined}
          size="lg"
        />
        <Text style={styles.name}>{getUserDisplayName(profile)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.firstName')}</Text>
        <Text style={styles.value}>{profile.firstName || '—'}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.lastName')}</Text>
        <Text style={styles.value}>{profile.lastName || '—'}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.gender')}</Text>
        <Text style={styles.value}>{formatGender(t, profile.gender)}</Text>
      </View>

      {showPhone ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t('profile.phone')}</Text>
          <Text style={styles.value}>{formatPhoneDisplay(phone)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 10,
    textAlign: 'center',
  },
  section: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: Colors.text,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
