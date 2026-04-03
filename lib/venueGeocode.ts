import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { geocodeVenueWithPhoton } from '@/lib/photonGeocode';

export type VenueLatLng = { latitude: number; longitude: number };

/**
 * Geocode venue text for embedded map previews (Photon/Nominatim, then device geocoder).
 */
export async function geocodeVenueAddress(address: string): Promise<VenueLatLng | null> {
  const q = address.trim();
  if (!q) return null;

  const photon = await geocodeVenueWithPhoton(q);
  if (photon) return photon;

  try {
    if (Platform.OS !== 'web') {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: next } = await Location.requestForegroundPermissionsAsync();
        if (next !== 'granted') return null;
      }
    }
    const results = await Location.geocodeAsync(q);
    const first = results[0];
    if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
      return null;
    }
    return { latitude: first.latitude, longitude: first.longitude };
  } catch {
    return null;
  }
}
