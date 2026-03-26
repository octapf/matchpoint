import { Platform } from 'react-native';
import type { LatLon } from '@/lib/weather/openMeteo';

/**
 * Loads expo-location only inside this async function so missing native binaries
 * reject here (caught) instead of at app startup.
 * Uses `granted` from the permission response (reliable across platforms).
 */
export async function tryGetDeviceLatLon(): Promise<LatLon | null> {
  if (Platform.OS === 'web') return null;

  let Location: typeof import('expo-location');
  try {
    Location = await import('expo-location');
  } catch {
    return null;
  }

  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}
