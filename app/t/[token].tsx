import React, { useEffect, useLayoutEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Platform, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTournamentByToken } from '@/lib/hooks/useTournaments';
import { useEntries, useCreateEntry } from '@/lib/hooks/useEntries';
import { useUserStore } from '@/store/useUserStore';
import { config } from '@/lib/config';
import i18n from '@/lib/i18n';
import { alertApiError } from '@/lib/utils/apiError';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

export default function JoinViaLinkScreen() {
  const { t } = useTranslation();
  const { token, lang: langParam } = useLocalSearchParams<{ token: string; lang?: string | string[] }>();
  const router = useRouter();
  const langQuery = Array.isArray(langParam) ? langParam[0] : langParam;

  useLayoutEffect(() => {
    if (langQuery === 'en' || langQuery === 'es' || langQuery === 'it') {
      i18n.locale = langQuery;
    }
    if (typeof document !== 'undefined' && (langQuery === 'en' || langQuery === 'es' || langQuery === 'it')) {
      document.documentElement.lang = langQuery;
    }
  }, [langQuery]);
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const canEnroll = user?.gender === 'male' || user?.gender === 'female';

  const { data: tournament, isLoading, isError } = useTournamentByToken(token || undefined);
  const tournamentId = tournament?._id;
  const { data: entries = [] } = useEntries(tournamentId ? { tournamentId } : undefined, { enabled: !!tournamentId });
  const createEntry = useCreateEntry();

  const hasJoined = entries.some((e) => e.userId === userId);

  useEffect(() => {
    if (userId && !canEnroll && !hasJoined && tournament && !isLoading) {
      Alert.alert(
        t('team.genderRequiredTitle'),
        t('inviteLink.genderRequiredProfile'),
        [{ text: t('common.ok'), onPress: () => router.replace('/profile/my-data') }]
      );
    }
  }, [userId, canEnroll, hasJoined, tournament, isLoading, router]);

  const handleJoin = () => {
    if (!tournamentId || !userId) return;
    if (hasJoined) {
      router.replace(`/tournament/${tournamentId}`);
      return;
    }
    if (!canEnroll) {
      router.replace('/profile/my-data');
      return;
    }
    createEntry.mutate(
      { tournamentId, userId, lookingForPartner: true },
      {
        onSuccess: () => router.replace(`/tournament/${tournamentId}`),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.joinFailed'),
      }
    );
  };

  const handleViewOnly = () => {
    if (tournamentId) router.replace(`/tournament/${tournamentId}`);
  };

  const handleSignIn = () => {
    router.replace({
      pathname: '/(auth)/sign-in',
      params: token ? { redirect: `/t/${token}` } : undefined,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton height={28} width="70%" style={{ marginBottom: 16 }} />
        <Skeleton height={18} width="90%" style={{ marginBottom: 24 }} />
        <Skeleton height={48} width="100%" style={{ marginBottom: 12 }} />
        <Skeleton height={48} width="100%" />
      </View>
    );
  }

  if (isError || !tournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('inviteLink.invalidLink')}</Text>
        <Text style={styles.subtitle}>{t('inviteLink.invalidLinkSubtitle')}</Text>
        <Button title={t('inviteLink.goBack')} onPress={() => router.back()} fullWidth />
      </View>
    );
  }

  // Web browser: must run before !userId — otherwise guests see native sign-in UI (Google doesn't work on web).
  if (Platform.OS === 'web') {
    const shareLang: 'en' | 'es' | 'it' =
      langQuery === 'en' || langQuery === 'es' || langQuery === 'it'
        ? langQuery
        : i18n.locale === 'es' || i18n.locale === 'it'
          ? i18n.locale
          : 'en';
    const inviteUrl = config.invite.getUrl(tournament.inviteLink, shareLang);
    const androidIntentUrl = config.invite.getAndroidIntentUrl(tournament.inviteLink, shareLang);
    const isAndroidWeb =
      typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const openInApp = () => {
      if (typeof window === 'undefined') return;
      if (isAndroidWeb) {
        window.location.href = androidIntentUrl;
        return;
      }
      Linking.openURL(inviteUrl);
    };
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('inviteLink.joinTournament')}</Text>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <Text style={styles.subtitle}>{t('inviteLink.webOpenInApp')}</Text>
        <View style={styles.buttonStack}>
          <Button title={t('inviteLink.openInApp')} onPress={openInApp} fullWidth />
          <Button title={t('inviteLink.viewTournament')} onPress={handleViewOnly} variant="secondary" fullWidth />
          <Button
            title={t('auth.getOnPlayStore')}
            onPress={() => Linking.openURL(PLAY_STORE_URL)}
            variant="outline"
            fullWidth
          />
        </View>
        <Text style={styles.webHint}>{t('inviteLink.webCopyHint', { url: inviteUrl })}</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('inviteLink.joinTournament')}</Text>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <Text style={styles.subtitle}>{t('auth.signInToJoin')}</Text>
        <View style={styles.buttonStack}>
          <Button title={t('auth.signIn')} onPress={handleSignIn} fullWidth />
          <Button
            title={t('inviteLink.viewTournament')}
            onPress={handleViewOnly}
            variant="secondary"
            fullWidth
          />
          <Button title={t('common.cancel')} onPress={() => router.back()} variant="outline" fullWidth />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('inviteLink.joinTournament')}</Text>
      <Text style={styles.tournamentName}>{tournament.name}</Text>
      <Text style={styles.subtitle}>
        {!canEnroll && !hasJoined
          ? t('inviteLink.genderRequiredProfile')
          : hasJoined
            ? t('inviteLink.alreadyJoined')
            : t('inviteLink.invitedToJoin')}
      </Text>
      <View style={styles.buttonStack}>
        {(canEnroll || hasJoined) && (
          <Button
            title={hasJoined ? t('inviteLink.viewTournament') : t('tournamentDetail.joinTournament')}
            onPress={handleJoin}
            disabled={createEntry.isPending}
            fullWidth
          />
        )}
        <Button
          title={t('common.cancel')}
          onPress={() => router.back()}
          variant="outline"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  tournamentName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.yellow,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  buttonStack: {
    gap: 12,
    width: '100%',
  },
  token: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 32,
  },
  webHint: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 24,
    textAlign: 'center',
  },
});
