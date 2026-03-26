import React, { useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { IconButton } from '@/components/ui/IconButton';
import { useTournaments } from '@/lib/hooks/useTournaments';
import { formatTournamentDate } from '@/lib/utils/dateFormat';
import { config } from '@/lib/config';
import { useLanguageStore } from '@/store/useLanguageStore';
import i18n from '@/lib/i18n';
import type { Tournament } from '@/types';

function maxPlayersForTournament(tournament: Tournament): number {
  return (tournament.maxTeams ?? 16) * 2;
}

export default function TournamentsScreen() {
  const { t } = useTranslation();
  const storedLanguage = useLanguageStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const { data: tournaments = [], isLoading, isError, error } = useTournaments();

  const shareTournament = useCallback(
    (tournament: Tournament) => {
      if (!tournament.inviteLink) return;
      const lang: 'en' | 'es' | 'it' =
        storedLanguage === 'en' || storedLanguage === 'es' || storedLanguage === 'it'
          ? storedLanguage
          : i18n.locale === 'es' || i18n.locale === 'it'
            ? i18n.locale
            : 'en';
      const url = config.invite.getUrl(tournament.inviteLink, lang);
      Share.share({
        message: t('tournamentDetail.inviteMessage', { name: tournament.name, url }),
        url,
        title: t('tournamentDetail.inviteTitle'),
      }).catch(() => Alert.alert(t('common.error'), t('tournamentDetail.couldNotShare')));
    },
    [storedLanguage, t],
  );

  const topPad = Math.max(insets.top, 12) + 8;
  const scrollContentStyle = [styles.scrollContent, { paddingTop: topPad }];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scroll} contentContainerStyle={scrollContentStyle}>
          <TabScreenHeader title={t('tournaments.screenTitle')} />
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.cardOuter}>
              <View style={styles.cardPressable}>
                <Skeleton height={22} width="70%" style={{ marginBottom: 8 }} />
                <Skeleton height={16} width="40%" style={{ marginBottom: 4 }} />
                <Skeleton height={16} width="50%" style={{ marginBottom: 8 }} />
                <Skeleton height={14} width="30%" />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.errorOuter]}>
        <View style={[styles.errorInner, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('tournaments.screenTitle')} />
          <Text style={styles.errorText}>{error?.message || t('tournaments.failedToLoad')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={scrollContentStyle}>
        <TabScreenHeader title={t('tournaments.screenTitle')} />
        {(tournaments as Tournament[]).map((tournament) => {
          const dateLabel = tournament.date || tournament.startDate;
          const maxP = maxPlayersForTournament(tournament);
          const current = tournament.entriesCount ?? 0;
          const hasInvite = !!tournament.inviteLink;
          return (
            <View key={tournament._id} style={styles.cardOuter}>
              <Link href={`/tournament/${tournament._id}`} asChild>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.cardPressable,
                    hasInvite ? styles.cardPressableWithShare : undefined,
                  ])}
                >
                  <Text style={styles.cardTitle}>{tournament.name}</Text>
                  <Text style={styles.cardDate}>{formatTournamentDate(dateLabel)}</Text>
                  <Text style={styles.cardLocation}>{tournament.location}</Text>
                  <Text style={styles.cardSpots}>
                    {t('tournaments.playersSignedUp', { current, max: maxP })}
                  </Text>
                </Pressable>
              </Link>
              {hasInvite ? (
                <View style={styles.shareCorner} pointerEvents="box-none">
                  <IconButton
                    icon="share-outline"
                    onPress={() => shareTournament(tournament)}
                    accessibilityLabel={t('tournamentDetail.shareInvite')}
                    color={Colors.yellow}
                    compact
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <Link href="/tournament/create" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>{t('tournaments.createButton')}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  cardOuter: {
    position: 'relative',
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  cardPressable: {
    padding: 16,
  },
  /** Room for top-right share icon (IconButton ~34pt + margin). */
  cardPressableWithShare: {
    paddingRight: 44,
  },
  shareCorner: {
    position: 'absolute',
    top: 8,
    right: 6,
    zIndex: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  cardLocation: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cardSpots: {
    fontSize: 12,
    color: Colors.yellow,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: Colors.yellow,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  errorOuter: {
    flex: 1,
  },
  errorInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
