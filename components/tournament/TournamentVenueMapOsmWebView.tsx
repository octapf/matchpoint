import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { geocodeVenueAddress } from '@/lib/venueGeocode';
import {
  VENUE_MAP_HEIGHT,
  VENUE_OSM_BBOX_DELTA,
  openVenueInMaps,
} from '@/components/tournament/venueMapShared';

type Props = {
  address: string;
};

/**
 * Embedded map without Google API keys: OpenStreetMap export iframe via WebView + device geocode.
 */
export function TournamentVenueMapOsmWebView({ address }: Props) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setLoading(false);
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    const coord = await geocodeVenueAddress(trimmed);
    if (!coord) {
      setFailed(true);
      setLoading(false);
      return;
    }
    const { latitude: lat, longitude: lng } = coord;
    const dLat = VENUE_OSM_BBOX_DELTA;
    const dLon = VENUE_OSM_BBOX_DELTA;
    const minLon = lng - dLon;
    const minLat = lat - dLat;
    const maxLon = lng + dLon;
    const maxLat = lat + dLat;
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik`;
    setUri(embed);
    setLoading(false);
  }, [address, VENUE_OSM_BBOX_DELTA]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.placeholder, { height: VENUE_MAP_HEIGHT }]}>
        <ActivityIndicator color={Colors.yellow} />
      </View>
    );
  }

  if (failed || !uri) {
    return (
      <View style={styles.fallbackBox}>
        <Text style={styles.fallbackMuted}>{t('tournamentDetail.venueMapUnavailable')}</Text>
        <Text style={styles.fallbackText} numberOfLines={4}>
          {address.trim()}
        </Text>
        <Pressable onPress={() => openVenueInMaps(address.trim())} accessibilityRole="link">
          <Text style={styles.fallbackLink}>{t('tournaments.mapsOpenInMaps')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView
      key={uri}
      source={{ uri }}
      style={styles.webview}
      scrollEnabled={false}
      nestedScrollEnabled={false}
      /** OSM iframe is interactive; block touches so the preview stays fixed. */
      pointerEvents="none"
      originWhitelist={['https://*', 'http://*']}
      setSupportMultipleWindows={false}
      accessibilityLabel={address.trim()}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    width: '100%',
    height: VENUE_MAP_HEIGHT,
    backgroundColor: Colors.surface,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
  },
  fallbackBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
    gap: 8,
  },
  fallbackMuted: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  fallbackText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 21,
  },
  fallbackLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.yellow,
  },
});
