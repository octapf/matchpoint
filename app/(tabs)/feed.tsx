import React, { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform, RefreshControl } from 'react-native';
import { WeatherPanelGradientLayer } from '@/components/weather/WeatherPanelGradientLayer';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';
import Colors from '@/constants/Colors';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { NotificationsInboxButton } from '@/components/notifications/NotificationsInboxButton';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TournamentListRow } from '@/components/tournament/TournamentListRow';
import { useWeather } from '@/lib/hooks/useWeather';
import { useTournaments } from '@/lib/hooks/useTournaments';
import type { Tournament } from '@/types';
import { weatherCodeToSkyKey, type WeatherPayload } from '@/lib/weather/openMeteo';
import {
  getWeatherPanelGradient,
  getWeatherPanelIconColors,
  getWeatherPanelScrimColor,
  type WeatherPanelIconColors,
} from '@/lib/weather/weatherPanelGradient';
import { prefetchTournament } from '@/lib/prefetchTournament';

function formatHourLabel(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function isDayHour(iso: string): boolean {
  const h = new Date(iso).getHours();
  return h >= 6 && h < 20;
}

function formatWindSpeedValue(kmh: number): string {
  const r = Math.round(kmh * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

function WeatherGlyph({
  skyKey,
  isDay,
  size,
  iconColors,
}: {
  skyKey: string;
  isDay: boolean;
  size: number;
  iconColors: WeatherPanelIconColors;
}) {
  const { glyph, sun, cloud } = iconColors;

  if (skyKey === 'clear') {
    return <Ionicons name={isDay ? 'sunny' : 'moon'} size={size} color={glyph} />;
  }

  const useSunCloud =
    (skyKey === 'mainlyClear' || skyKey === 'partlyCloudy') && sun != null && cloud != null;

  if (useSunCloud) {
    const sunIcon = isDay ? 'sunny' : 'moon';
    const cloudIcon = skyKey === 'mainlyClear' ? 'cloud-outline' : 'cloud';
    const sunSize = size * 0.78;
    const cloudSize = size * 0.7;
    return (
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Ionicons
          name={sunIcon}
          size={sunSize}
          color={sun}
          style={{ position: 'absolute', left: 0, top: size * 0.04 }}
        />
        <Ionicons
          name={cloudIcon}
          size={cloudSize}
          color={cloud}
          style={{ position: 'absolute', right: -size * 0.06, bottom: -size * 0.02 }}
        />
      </View>
    );
  }

  const map: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
    mainlyClear: 'partly-sunny-outline',
    partlyCloudy: 'partly-sunny',
    overcast: 'cloudy',
    fog: 'cloud',
    drizzle: 'rainy-outline',
    rain: 'rainy',
    snow: 'snow',
    showers: 'rainy',
    snowShowers: 'snow',
    thunderstorm: 'thunderstorm',
    unknown: 'cloud-outline',
  };
  const name = map[skyKey] ?? 'cloud-outline';
  return <Ionicons name={name} size={size} color={glyph} />;
}

export default function FeedScreen() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useLanguageStore((s) => s.language ?? 'en');
  const { data, isLoading, isError, error, refetch, isFetching, usedDeviceLocation, refreshLocation, locationAreaName } =
    useWeather();
  const {
    data: tournaments = [],
    isLoading: loadingTournaments,
    isError: tournamentsQueryError,
    refetch: refetchTournaments,
    isFetching: isFetchingTournaments,
  } = useTournaments();

  useFocusEffect(
    useCallback(() => {
      void refetchTournaments();
      if (!usedDeviceLocation) {
        void refreshLocation();
      }
    }, [usedDeviceLocation, refreshLocation, refetchTournaments]),
  );

  const dateLabel = useMemo(() => {
    const locale = language === 'es' ? 'es' : language === 'it' ? 'it' : 'en';
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date());
    } catch {
      return new Date().toDateString();
    }
  }, [language]);

  const localeTag = language === 'es' ? 'es' : language === 'it' ? 'it' : 'en';
  const payload = data as WeatherPayload | undefined;
  const current = payload?.current;
  const hourly = payload?.hourly ?? [];
  const skyKey = current != null ? weatherCodeToSkyKey(current.weatherCode) : 'unknown';
  const skyLabel = t(`feed.sky.${skyKey}`);
  const weatherReady = current != null;
  const panelIconColors =
    weatherReady && current && !isError ? getWeatherPanelIconColors(skyKey, current.isDay) : null;

  const topPad = Math.max(insets.top, 12) + 8;
  const scrollContentStyle = useMemo(
    () => [styles.content, { paddingTop: topPad }],
    [topPad],
  );

  const listHeader = useMemo(
    () => (
      <>
        <TabScreenHeader title={t('feed.homeTitle')} rightAccessory={<NotificationsInboxButton />} />

        <View style={styles.weatherCard}>
          {weatherReady && !isError && current ? (
            <>
              <View style={styles.weatherGradientLayer} pointerEvents="none">
                <WeatherPanelGradientLayer colors={getWeatherPanelGradient(skyKey, current.isDay)} />
              </View>
              <View
                style={[styles.weatherScrim, { backgroundColor: getWeatherPanelScrimColor(current.isDay) }]}
                pointerEvents="none"
              />
            </>
          ) : null}
          <View style={styles.weatherCardForeground}>
            {isLoading && !weatherReady ? (
              <View style={styles.weatherBody}>
                <Skeleton height={44} width="45%" style={{ marginBottom: 8 }} />
                <Skeleton height={16} width="70%" style={{ marginBottom: 12 }} />
                <Skeleton height={14} width="90%" />
              </View>
            ) : isError || !weatherReady ? (
              <View style={styles.weatherBody}>
                <Text style={styles.errorText}>{error instanceof Error ? error.message : t('feed.error')}</Text>
                <Button title={t('feed.retry')} onPress={() => void refetch()} variant="secondary" />
              </View>
            ) : (
              <View style={styles.weatherBody}>
                <View style={styles.weatherTopRow}>
                  <WeatherGlyph skyKey={skyKey} isDay={current.isDay} size={30} iconColors={panelIconColors!} />
                  <Text style={styles.temp}>{Math.round(current.temperatureC)}°</Text>
                </View>
                <Text style={styles.skyText}>{skyLabel}</Text>

                <View style={styles.weatherMetaBlock}>
                  <Text style={styles.weatherDateLine}>
                    {t('feed.today')} · {dateLabel}
                  </Text>
                  {usedDeviceLocation ? (
                    <Text style={styles.locationHint}>{locationAreaName ?? t('feed.locationNearby')}</Text>
                  ) : Platform.OS !== 'web' ? (
                    <Pressable
                      onPress={() => void Linking.openSettings()}
                      accessibilityRole="button"
                      accessibilityLabel={t('feed.locationEnableHint')}
                    >
                      <Text style={[styles.locationHint, styles.locationHintLink]}>{t('feed.locationEnableHint')}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.locationHint}>{t('feed.locationFallback')}</Text>
                  )}
                  {isFetching && !isLoading && weatherReady ? (
                    <Text style={styles.updating}>{t('feed.loading')}</Text>
                  ) : null}
                </View>

                {hourly.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    nestedScrollEnabled
                    contentContainerStyle={styles.hourlyScrollContent}
                    style={styles.hourlyScroll}
                  >
                    {hourly.map((h, i) => {
                      const hk = weatherCodeToSkyKey(h.weatherCode);
                      const hourDay = isDayHour(h.timeIso);
                      const hourColors = getWeatherPanelIconColors(hk, hourDay);
                      return (
                        <View key={`h-${h.timeIso}-${i}`} style={styles.hourSlot}>
                          <Text style={styles.hourlyTime}>{formatHourLabel(h.timeIso, localeTag)}</Text>
                          <View style={styles.hourlyTempRow}>
                            <WeatherGlyph skyKey={hk} isDay={hourDay} size={16} iconColors={hourColors} />
                            <Text style={styles.hourlyTemp}>{Math.round(h.temperatureC)}°</Text>
                          </View>
                          <View style={styles.hourlyWindBlock}>
                            <View style={styles.hourlyWindSpeedRow}>
                              <MaterialCommunityIcons
                                name="weather-windy"
                                size={14}
                                color={hourColors.wind}
                                style={styles.hourlyWindIcon}
                              />
                              <Text style={styles.hourlyWindValue}>{formatWindSpeedValue(h.windSpeedKmh)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            )}
          </View>
        </View>

        <View style={styles.tournamentsSection}>
          <Text style={styles.sectionTitle}>{t('feed.tournamentsPreview')}</Text>
        </View>
      </>
    ),
    [
      t,
      isLoading,
      weatherReady,
      isError,
      error,
      refetch,
      skyKey,
      skyLabel,
      current,
      hourly,
      dateLabel,
      usedDeviceLocation,
      locationAreaName,
      isFetching,
      localeTag,
      panelIconColors,
    ],
  );

  const listFooter = useMemo(
    () => (
      <View style={styles.feedSection}>
        <Text style={styles.sectionTitle}>{t('feed.moreComing')}</Text>
        <Pressable
          style={styles.linkCard}
          onPress={() => {
            router.push('/(tabs)/index' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('feed.goTournaments')}
        >
          <Ionicons name="trophy-outline" size={22} color={Colors.yellow} />
          <Text style={styles.linkCardText}>{t('feed.goTournaments')}</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>
    ),
    [t, router],
  );

  const listEmpty = useMemo(() => {
    if (tournamentsQueryError) {
      return (
        <View style={styles.tournamentsSection}>
          <Text style={styles.tournamentError}>{t('tournaments.failedToLoad')}</Text>
        </View>
      );
    }
    if (loadingTournaments && (tournaments as Tournament[]).length === 0) {
      return (
        <View style={styles.tournamentsSection}>
          <View style={styles.skeletonCard}>
            <Skeleton height={20} width="65%" style={{ marginBottom: 10 }} />
            <Skeleton height={14} width="45%" style={{ marginBottom: 6 }} />
            <Skeleton height={14} width="55%" style={{ marginBottom: 8 }} />
            <Skeleton height={12} width="35%" />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.tournamentsSection}>
        <Text style={styles.tournamentEmpty}>{t('feed.noTournamentsYet')}</Text>
      </View>
    );
  }, [t, tournamentsQueryError, loadingTournaments, tournaments]);

  const renderTournamentItem = useCallback(
    ({ item: tournament }: { item: Tournament }) => (
      <TournamentListRow
        variant="feed"
        tournament={tournament}
        onPressIn={() => prefetchTournament(queryClient, tournament._id)}
        onPress={() => router.push(`/tournament/${tournament._id}` as never)}
      />
    ),
    [queryClient, router],
  );

  return (
    <FlashList
      data={tournaments as Tournament[]}
      keyExtractor={(item) => item._id}
      renderItem={renderTournamentItem}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={listEmpty}
      style={styles.container}
      contentContainerStyle={scrollContentStyle}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isFetchingTournaments}
          onRefresh={() => void refetchTournaments()}
          tintColor={Colors.yellow}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  weatherMetaBlock: {
    marginBottom: 6,
  },
  weatherDateLine: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.92)',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  weatherCard: {
    position: 'relative',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  weatherGradientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  weatherScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  weatherCardForeground: {
    position: 'relative',
    zIndex: 1,
  },
  weatherBody: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  weatherTopRow: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 2,
  },
  temp: {
    fontSize: 34,
    fontWeight: '200',
    color: Colors.text,
    letterSpacing: -1.2,
  },
  skyText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.94)',
    marginBottom: 4,
  },
  hourlyScroll: {
    marginBottom: 0,
    marginHorizontal: -4,
    maxHeight: 132,
  },
  hourlyScrollContent: {
    paddingVertical: 0,
    paddingRight: 8,
    gap: 0,
    alignItems: 'flex-start',
  },
  hourSlot: {
    width: 58,
    alignItems: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginRight: 8,
    gap: 6,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 0,
  },
  hourlyTime: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 0,
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  hourlyTemp: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 0,
    marginBottom: 0,
  },
  hourlyTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: 5,
  },
  hourlyWindBlock: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    marginTop: 0,
  },
  hourlyWindIcon: {
    marginRight: 2,
  },
  hourlyWindSpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
  },
  hourlyWindValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  locationHint: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    fontStyle: 'italic',
  },
  locationHintLink: {
    textDecorationLine: 'underline',
  },
  updating: {
    fontSize: 13,
    color: Colors.yellow,
    marginTop: 6,
  },
  errorText: {
    color: '#f87171',
    marginBottom: 12,
    fontSize: 15,
  },
  tournamentsSection: { gap: 10, marginBottom: 22 },
  skeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  tournamentEmpty: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  tournamentError: {
    fontSize: 14,
    color: Colors.error,
  },
  feedSection: { gap: 12 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  linkCardText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});
