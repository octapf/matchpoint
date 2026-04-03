import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Colors from '@/constants/Colors';
import { geocodeVenueAddress, type VenueLatLng } from '@/lib/venueGeocode';
import { TournamentVenueMapOsmWebView } from '@/components/tournament/TournamentVenueMapOsmWebView';
import { VENUE_MAP_APPLE_ALTITUDE, VENUE_MAP_HEIGHT } from '@/components/tournament/venueMapShared';

type MapProps = { address: string; coord: VenueLatLng };

function AppleVenueMap({ address, coord }: MapProps) {
  const mapRef = useRef<MapView | null>(null);

  /** Apple Maps uses camera altitude; re-snap after layout so framing stays tight. */
  const applyZoom = useCallback(() => {
    const camera = {
      center: { latitude: coord.latitude, longitude: coord.longitude },
      altitude: VENUE_MAP_APPLE_ALTITUDE,
      heading: 0,
      pitch: 0,
    } as const;
    const snap = () => mapRef.current?.animateCamera(camera, { duration: 0 });
    snap();
    setTimeout(snap, 250);
  }, [coord.latitude, coord.longitude, VENUE_MAP_APPLE_ALTITUDE]);

  return (
    <View style={styles.mapWrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialCamera={{
          center: { latitude: coord.latitude, longitude: coord.longitude },
          altitude: VENUE_MAP_APPLE_ALTITUDE,
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

export type TournamentVenueMapProps = {
  address: string;
};

/** iOS: Apple Maps via react-native-maps. If geocoding fails, falls back to embedded OSM (WebView). */
export function TournamentVenueMap({ address }: TournamentVenueMapProps) {
  const trimmed = address.trim();
  const [coord, setCoord] = useState<VenueLatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!trimmed) {
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
  }, [trimmed]);

  useEffect(() => {
    load();
  }, [load]);

  if (!trimmed) return null;

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
      <AppleVenueMap address={trimmed} coord={coord} />
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
