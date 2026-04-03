import { Linking, Platform } from 'react-native';

/** Taller preview so labels stay legible at a fixed zoom. */
export const VENUE_MAP_HEIGHT = 260;

/**
 * Region delta fallback when only a region is available. Keep small so it matches street-level.
 * Prefer `initialCamera` + `VENUE_MAP_GOOGLE_ZOOM` / `VENUE_MAP_APPLE_ALTITUDE` on native maps.
 */
export const VENUE_MAP_REGION_DELTA = 0.00006;

/**
 * Google Maps SDK camera zoom (typical range ~2–21). 21 is max in many cities — use for readable streets.
 */
export const VENUE_MAP_GOOGLE_ZOOM = 21;

/** Apple Maps camera altitude (meters). Lower = closer; ~40–55m ≈ street-name readable in preview. */
export const VENUE_MAP_APPLE_ALTITUDE = 48;

/** Half-extent in degrees for OSM embed bbox (smaller = tighter / more zoomed). */
export const VENUE_OSM_BBOX_DELTA = 0.00007;

/** Opens the system maps app: Apple Maps on iOS, Google Maps on Android; web uses Google in the browser. */
export function openVenueInMaps(query: string, onOpenFailed?: () => void) {
  const q = query.trim();
  if (!q) return Promise.resolve(undefined);
  const encoded = encodeURIComponent(q);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${encoded}`
      : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  return Linking.openURL(url).catch(() => {
    onOpenFailed?.();
    return undefined;
  });
}

/** @deprecated Use `openVenueInMaps` (opens Apple Maps on iOS). */
export function openVenueInGoogleMaps(query: string) {
  return openVenueInMaps(query);
}
