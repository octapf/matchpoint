import React, { useCallback, useEffect, useRef } from 'react';
import i18n, { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, Alert, RefreshControl, Animated, Easing } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { NotificationsInboxButton } from '@/components/notifications/NotificationsInboxButton';
import { TournamentListRow } from '@/components/tournament/TournamentListRow';
import { AppBackgroundGradient } from '@/components/ui/AppBackgroundGradient';
import { useTheme } from '@/lib/theme/useTheme';
import { useTournaments } from '@/lib/hooks/useTournaments';
import { config } from '@/lib/config';
import { useLanguageStore } from '@/store/useLanguageStore';
import type { Tournament } from '@/types';
import { prefetchTournament } from '@/lib/prefetchTournament';

export default function TournamentsScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const storedLanguage = useLanguageStore((s) => s.language);
  const insets = useSafeAreaInsets();
  const { data: tournaments = [], isLoading, isError, error, refetch, isFetching } = useTournaments();

  const shineX = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(8000),
        Animated.timing(shineX, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(shineX, {
          toValue: -1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shineX]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

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

  const renderTournamentItem = useCallback(
    ({ item: tournament }: { item: Tournament }) => (
      <TournamentListRow
        variant="home"
        tournament={tournament}
        onPressIn={() => prefetchTournament(queryClient, tournament._id)}
        onPress={() => router.push(`/tournament/${tournament._id}`)}
        onSharePress={shareTournament}
      />
    ),
    [queryClient, router, shareTournament],
  );

  const listEmpty = useCallback(
    () => (
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
    ),
    [t, router],
  );

  const topPad = Math.max(insets.top, 12) + 8;
  const scrollContentStyle = [styles.scrollContent, { paddingTop: 0 }];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AppBackgroundGradient />
        <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('tournaments.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={scrollContentStyle}>
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
        <AppBackgroundGradient />
        <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
          <TabScreenHeader title={t('tournaments.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
        </View>
        <View style={styles.errorInner}>
          <Text style={styles.errorText}>{error?.message || t('tournaments.failedToLoad')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBackgroundGradient />
      <View style={[styles.stickyScreenHeader, { paddingTop: topPad }]}>
        <TabScreenHeader title={t('tournaments.screenTitle')} rightAccessory={<NotificationsInboxButton />} />
      </View>
      <FlashList
        data={tournaments as Tournament[]}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={listEmpty}
        renderItem={renderTournamentItem}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} tintColor={tokens.accent} />}
        contentContainerStyle={scrollContentStyle}
        style={styles.scroll}
      />
      <Pressable
        style={[
          styles.fab,
          { backgroundColor: tokens.accentSecondaryMuted, borderColor: tokens.accentSecondaryOutline },
        ]}
        onPress={() => router.push('/tournament/create')}
        accessibilityRole="button"
        accessibilityLabel={t('tournaments.create')}
      >
        <Text style={[styles.fabText, { color: tokens.accent }]}>{t('tournaments.createButton')}</Text>
        <View style={styles.fabShineClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.fabShine,
              {
                transform: [
                  {
                    translateX: shineX.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-140, 140],
                    }),
                  },
                  {
                    translateY: shineX.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [18, -18],
                    }),
                  },
                  { rotate: '-18deg' },
                ],
              },
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  /** Logo + title + notifications — fixed above scroll so they stay visible. */
  stickyScreenHeader: {
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    zIndex: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  fabShineClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 12,
  },
  fabShine: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    width: 46,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  errorOuter: {
    flex: 1,
  },
  errorInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    justifyContent: 'center',
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
    backgroundColor: Colors.surfaceLight,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', fontStyle: 'italic' },
});
