import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@/lib/i18n';
import { useLanguageStore } from '@/store/useLanguageStore';
import Colors from '@/constants/Colors';
import { TabScreenHeader } from '@/components/ui/TabScreenHeader';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWeather } from '@/lib/hooks/useWeather';
import { weatherCodeToSkyKey, type WeatherPayload } from '@/lib/weather/openMeteo';

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
}: {
  skyKey: string;
  isDay: boolean;
  size: number;
}) {
  const color = Colors.yellow;
  if (skyKey === 'clear') {
    return <Ionicons name={isDay ? 'sunny' : 'moon'} size={size} color={color} />;
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
  return <Ionicons name={name} size={size} color={color} />;
}

export default function FeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useLanguageStore((s) => s.language ?? 'en');
  const { data, isLoading, isError, error, refetch, isFetching, usedDeviceLocation, refreshLocation, locationAreaName } =
    useWeather();

  useFocusEffect(
    useCallback(() => {
      if (!usedDeviceLocation) {
        void refreshLocation();
      }
    }, [usedDeviceLocation, refreshLocation])
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 12) + 8 }]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <TabScreenHeader title={t('feed.homeTitle')} />

      <View style={styles.weatherCard}>
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
              <WeatherGlyph skyKey={skyKey} isDay={current.isDay} size={44} />
              <Text style={styles.temp}>{Math.round(current.temperatureC)}°</Text>
            </View>
            <Text style={styles.skyText}>{skyLabel}</Text>

            <View style={styles.weatherMetaBlock}>
              <Text style={styles.weatherDateLine}>
                {t('feed.today')} · {dateLabel}
              </Text>
              {usedDeviceLocation ? (
                <Text style={styles.locationHint}>
                  {locationAreaName ?? t('feed.locationNearby')}
                </Text>
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
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  nestedScrollEnabled
                  contentContainerStyle={styles.hourlyScrollContent}
                  style={styles.hourlyScroll}
                >
                  {hourly.map((h, i) => {
                    const hk = weatherCodeToSkyKey(h.weatherCode);
                    return (
                      <View key={`w-${h.timeIso}-${i}`} style={styles.hourSlot}>
                        <Text style={styles.hourlyTime}>{formatHourLabel(h.timeIso, localeTag)}</Text>
                        <WeatherGlyph skyKey={hk} isDay={isDayHour(h.timeIso)} size={22} />
                        <Text style={styles.hourlyTemp}>{Math.round(h.temperatureC)}°</Text>
                      </View>
                    );
                  })}
                </ScrollView>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  nestedScrollEnabled
                  contentContainerStyle={styles.hourlyScrollContent}
                  style={[styles.hourlyScroll, styles.hourlyWindRow]}
                >
                  {hourly.map((h, i) => (
                    <View key={`wind-${h.timeIso}-${i}`} style={styles.hourSlot}>
                      <Text style={styles.hourlyTime}>{formatHourLabel(h.timeIso, localeTag)}</Text>
                      <MaterialCommunityIcons
                        name="weather-windy"
                        size={18}
                        color={Colors.violet}
                        style={styles.hourlyWindIcon}
                      />
                      <View style={styles.hourlyWindSpeedRow}>
                        <Text style={styles.hourlyWindValue}>{formatWindSpeedValue(h.windSpeedKmh)}</Text>
                        <Text style={styles.hourlyWindUnit}>km/h</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.feedSection}>
        <Text style={styles.sectionTitle}>{t('feed.moreComing')}</Text>
        <Pressable
          style={styles.linkCard}
          onPress={() => {
            router.push('/(tabs)/index' as never);
          }}
        >
          <Ionicons name="trophy-outline" size={22} color={Colors.yellow} />
          <Text style={styles.linkCardText}>{t('feed.goTournaments')}</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  weatherMetaBlock: {
    marginBottom: 12,
  },
  weatherDateLine: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  weatherCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  weatherBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  weatherTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  temp: {
    fontSize: 48,
    fontWeight: '200',
    color: Colors.text,
    letterSpacing: -1.5,
  },
  skyText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  hourlyWindRow: {
    marginTop: 10,
  },
  hourlyScroll: {
    marginBottom: 2,
    marginHorizontal: -4,
  },
  hourlyScrollContent: {
    paddingVertical: 2,
    paddingRight: 10,
    gap: 0,
  },
  hourSlot: {
    width: 64,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginRight: 6,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  hourlyTime: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 3,
  },
  hourlyTemp: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 3,
  },
  hourlyWindIcon: {
    marginVertical: 2,
  },
  hourlyWindSpeedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
  },
  hourlyWindValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  hourlyWindUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: Colors.textMuted,
    marginLeft: 2,
  },
  locationHint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  locationHintLink: {
    textDecorationLine: 'underline',
  },
  updating: {
    fontSize: 12,
    color: Colors.yellow,
    marginTop: 6,
  },
  errorText: {
    color: '#f87171',
    marginBottom: 12,
    fontSize: 15,
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
