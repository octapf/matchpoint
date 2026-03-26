import React, { useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { IconButton } from '@/components/ui/IconButton';
import { TournamentStatsBlock } from '@/components/ui/TournamentStatsBlock';
import { useTournaments } from '@/lib/hooks/useTournaments';
import { formatTournamentDate } from '@/lib/utils/dateFormat';
import { config } from '@/lib/config';
import { useLanguageStore } from '@/store/useLanguageStore';
import i18n from '@/lib/i18n';
import type { Tournament } from '@/types';
import { maxPlayerSlotsForTournament, normalizeGroupCount } from '@/lib/tournamentGroups';

export default function TournamentsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const storedLanguage = useLanguageStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const { data: tournaments = [], isLoading, isError, error, refetch, isFetching } = useTournaments();

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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} tintColor={Colors.yellow} />}
      >
        <TabScreenHeader title={t('tournaments.screenTitle')} />
        {tournaments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={34} color={Colors.textMuted} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>{t('admin.noTournaments')}</Text>
            <Text style={styles.emptySubtitle}>{t('feed.noTournamentsYet')}</Text>
            <View style={{ marginTop: 14 }}>
              <Pressable style={styles.emptyCta} onPress={() => router.push('/tournament/create')}>
                <Text style={styles.emptyCtaText}>{t('tournaments.create')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
        {(tournaments as Tournament[]).map((tournament) => {
          const dateLabel = tournament.date || tournament.startDate;
          const maxP = maxPlayerSlotsForTournament(tournament.maxTeams ?? 16);
          const current = tournament.entriesCount ?? 0;
          const totalGroups = normalizeGroupCount(tournament.groupCount);
          const hasInvite = !!tournament.inviteLink;
          const isCancelled = tournament.status === 'cancelled';
          return (
            <View
              key={tournament._id}
              style={[styles.cardOuter, isCancelled && styles.cardOuterCancelled]}
            >
              <Pressable
                style={[
                  styles.cardPressable,
                  hasInvite ? styles.cardPressableWithShare : undefined,
                ]}
                onPress={() => router.push(`/tournament/${tournament._id}`)}
              >
                <Text style={styles.cardTitle}>{tournament.name}</Text>
                {isCancelled ? (
                  <View style={styles.cancelledRow} accessibilityRole="text">
                    <Ionicons name="close-circle" size={16} color={Colors.error} />
                    <Text style={styles.cancelledBadge}>{t('tournaments.cancelledBadge')}</Text>
                  </View>
                ) : null}
                <Text style={styles.cardDate}>
                  {formatTournamentDate(dateLabel) || '—'}
                </Text>
                <Text style={styles.cardLocation}>{tournament.location?.trim() || '—'}</Text>
                <Text style={styles.cardMetaSecondary} numberOfLines={1}>
                  {[
                    ...[
                      ...(tournament.divisions?.includes('men') ? [t('tournaments.divisionMen')] : []),
                      ...(tournament.divisions?.includes('women') ? [t('tournaments.divisionWomen')] : []),
                      ...(tournament.divisions?.includes('mixed') ? [t('tournaments.divisionMixed')] : []),
                    ],
                    tournament.categories?.length
                      ? tournament.categories.length === 2 &&
                        tournament.categories.includes('Gold') &&
                        tournament.categories.includes('Silver')
                        ? t('tournaments.categoryGoldSilver')
                        : tournament.categories.length === 3 &&
                            tournament.categories.includes('Gold') &&
                            tournament.categories.includes('Silver') &&
                            tournament.categories.includes('Bronze')
                          ? t('tournaments.categoryGoldSilverBronze')
                          : tournament.categories.join(' · ')
                      : t('tournaments.categoryNone'),
                  ].join(' · ')}
                </Text>
                <View style={styles.cardStats}>
                  <TournamentStatsBlock
                    compact
                    horizontal
                    muted={isCancelled}
                    currentPlayers={current}
                    totalPlayers={maxP}
                    currentTeams={tournament.teamsCount ?? 0}
                    totalTeams={tournament.maxTeams ?? 16}
                    currentGroups={tournament.groupsWithTeamsCount ?? 0}
                    totalGroups={totalGroups}
                    waitlistCount={tournament.waitlistCount ?? 0}
                  />
                </View>
                {isCancelled ? (
                  <Text style={styles.cardCancelledSub}>{t('tournaments.cancelledListHint')}</Text>
                ) : null}
              </Pressable>
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
          </>
        )}
      </ScrollView>
      <Pressable style={styles.fab} onPress={() => router.push('/tournament/create')}>
        <Text style={styles.fabText}>{t('tournaments.createButton')}</Text>
      </Pressable>
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
  cardOuterCancelled: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cancelledBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.error,
    letterSpacing: 0.3,
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
  cardMetaSecondary: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  cardStats: {
    marginBottom: 4,
  },
  cardCancelledSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
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
    textTransform: 'uppercase',
    fontStyle: 'italic',
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
  emptyState: {
    marginTop: 28,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  emptyCta: {
    backgroundColor: Colors.yellow,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', fontStyle: 'italic' },
});
