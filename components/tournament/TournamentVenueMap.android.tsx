import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { config } from '@/lib/config';
import { geocodeVenueAddress, type VenueLatLng } from '@/lib/venueGeocode';
import { TournamentVenueMapOsmWebView } from '@/components/tournament/TournamentVenueMapOsmWebView';
import { VENUE_MAP_GOOGLE_ZOOM, VENUE_MAP_HEIGHT } from '@/components/tournament/venueMapShared';
import Colors from '@/constants/Colors';

export type TournamentVenueMapProps = {
  address: string;
};

function GoogleVenueMap({ address, coord }: { address: string; coord: VenueLatLng }) {
  const mapRef = useRef<MapView | null>(null);

  /** Snap to max street zoom; repeat once after layout — native fit can otherwise override zoom. */
  const applyZoom = useCallback(() => {
    const camera = {
      center: { latitude: coord.latitude, longitude: coord.longitude },
      zoom: VENUE_MAP_GOOGLE_ZOOM,
      heading: 0,
      pitch: 0,
    } as const;
    const snap = () => mapRef.current?.animateCamera(camera, { duration: 0 });
    snap();
    setTimeout(snap, 250);
  }, [coord.latitude, coord.longitude, VENUE_MAP_GOOGLE_ZOOM]);

  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialCamera={{
          center: { latitude: coord.latitude, longitude: coord.longitude },
          zoom: VENUE_MAP_GOOGLE_ZOOM,
          heading: 0,
          pitch: 0,
        }}
        onMapReady={applyZoom}
        scrollEnabled={false}
        zoomEnabled={false}
        zoomTapEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        showsUserLocation={false}
        accessibilityLabel={address}
      >
        <Marker coordinate={coord} title={address} />
      </MapView>
    </View>
  );
}

/**
 * Android: embedded Google Map when `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is set (Maps SDK + plugin at build time).
 * Otherwise OpenStreetMap in a WebView (no Google API key).
 */
export function TournamentVenueMap({ address }: TournamentVenueMapProps) {
  const trimmed = address.trim();
  const [coord, setCoord] = useState<VenueLatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const hasGoogleKey = !!config.google.mapsApiKey;

  const load = useCallback(async () => {
    if (!trimmed) {
      setLoading(false);
      return;
    }
    if (!hasGoogleKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const c = await geocodeVenueAddress(trimmed);
    if (c) {
      setCoord(c);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, [trimmed, hasGoogleKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (!trimmed) return null;

  if (!hasGoogleKey) {
    return (
      <View style={styles.root}>
        <TournamentVenueMapOsmWebView address={trimmed} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.placeholder, { height: VENUE_MAP_HEIGHT }]}>
        <ActivityIndicator color={Colors.yellow} />
      </View>
    );
  }

  if (failed || !coord) {
    return (
      <View style={styles.root}>
        <TournamentVenueMapOsmWebView address={trimmed} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GoogleVenueMap address={trimmed} coord={coord} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
  },
  mapWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: VENUE_MAP_HEIGHT,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
  },
});
