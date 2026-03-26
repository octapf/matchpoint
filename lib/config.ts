/**
 * API configuration - uses Expo's EXPO_PUBLIC_ for client-side env vars
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const INVITE_BASE_URL = process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'https://matchpoint.miralab.ar';

/** When true, use local tournament/team/entry/user mocks even if EXPO_PUBLIC_API_URL is set. */
const DEV_MOCK_DATA =
  process.env.EXPO_PUBLIC_DEV_MOCK_DATA === '1' ||
  process.env.EXPO_PUBLIC_DEV_MOCK_DATA === 'true';

const WEATHER_DEFAULT_LAT = parseFloat(process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LAT || '41.3851');
const WEATHER_DEFAULT_LON = parseFloat(process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LON || '2.1734');

export const config = {
  api: {
    baseUrl: API_URL,
    isConfigured: !!API_URL,
  },
  /** Open-Meteo (no key). Used when location permission is denied or unavailable. */
  weather: {
    defaultLat: WEATHER_DEFAULT_LAT,
    defaultLon: WEATHER_DEFAULT_LON,
  },
  dev: {
    mockData: DEV_MOCK_DATA,
  },
  google: {
    clientId: GOOGLE_CLIENT_ID,
    /** Required on Android for expo-auth-session. Falls back to web clientId to avoid crash. */
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_CLIENT_ID,
    isConfigured: !!GOOGLE_CLIENT_ID,
  },
  invite: {
    baseUrl: INVITE_BASE_URL,
    /** Full URL for sharing; pass lang so web invite page matches sharer's UI (see ?lang= on /t/[token]). */
    getUrl: (token: string, lang?: 'en' | 'es' | 'it') => {
      const path = `${INVITE_BASE_URL}/t/${encodeURIComponent(token)}`;
      if (lang === 'en' || lang === 'es' || lang === 'it') {
        return `${path}?lang=${lang}`;
      }
      return path;
    },
    /** Android: opens installed app from Chrome when App Links are not verified yet. */
    getAndroidIntentUrl: (token: string, lang?: 'en' | 'es' | 'it') => {
      const host = INVITE_BASE_URL.replace(/^https?:\/\//, '');
      const qs = lang === 'en' || lang === 'es' || lang === 'it' ? `?lang=${lang}` : '';
      const path = `/t/${encodeURIComponent(token)}${qs}`;
      return `intent://${host}${path}#Intent;scheme=https;package=com.miralab.matchpoint;end`;
    },
  },
};

/** Offline mocks when no API URL, or explicit EXPO_PUBLIC_DEV_MOCK_DATA while API stays configured (e.g. OAuth). */
export function shouldUseDevMocks(): boolean {
  return !config.api.isConfigured || config.dev.mockData;
}
