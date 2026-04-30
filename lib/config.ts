/**
 * API configuration - uses Expo's EXPO_PUBLIC_ for client-side env vars
 */

import Constants from 'expo-constants';

type Extra = Record<string, unknown> & {
  EXPO_PUBLIC_API_URL?: unknown;
  EXPO_PUBLIC_GOOGLE_CLIENT_ID?: unknown;
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?: unknown;
  EXPO_PUBLIC_INVITE_BASE_URL?: unknown;
  EXPO_PUBLIC_DEV_MOCK_DATA?: unknown;
  EXPO_PUBLIC_WEATHER_DEFAULT_LAT?: unknown;
  EXPO_PUBLIC_WEATHER_DEFAULT_LON?: unknown;
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?: unknown;
};

const extra: Extra =
  ((Constants as unknown as { expoConfig?: { extra?: unknown } }).expoConfig?.extra as Extra | undefined) ?? {};

/** Matches `eas.json` / `app.config.js` — release builds must never ship with an empty API origin. */
const DEFAULT_PRODUCTION_API_URL = 'https://matchpoint-neon-delta.vercel.app';
/** Dev default for physical device via USB + `adb reverse tcp:3000 tcp:3000`. */
const DEFAULT_DEV_API_URL = 'http://localhost:3000';

let API_URL =
  process.env.EXPO_PUBLIC_API_URL || (typeof extra.EXPO_PUBLIC_API_URL === 'string' ? extra.EXPO_PUBLIC_API_URL : '') || '';
if (!API_URL) {
  API_URL = __DEV__ ? DEFAULT_DEV_API_URL : DEFAULT_PRODUCTION_API_URL;
}
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  (typeof extra.EXPO_PUBLIC_GOOGLE_CLIENT_ID === 'string' ? extra.EXPO_PUBLIC_GOOGLE_CLIENT_ID : '') ||
  '';
const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  (typeof extra.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID === 'string'
    ? extra.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    : '') ||
  '';
const INVITE_BASE_URL =
  process.env.EXPO_PUBLIC_INVITE_BASE_URL ||
  (typeof extra.EXPO_PUBLIC_INVITE_BASE_URL === 'string' ? extra.EXPO_PUBLIC_INVITE_BASE_URL : '') ||
  'https://matchpoint.miralab.ar';

/** When true, use local tournament/team/entry/user mocks even if EXPO_PUBLIC_API_URL is set. */
const DEV_MOCK_DATA =
  process.env.EXPO_PUBLIC_DEV_MOCK_DATA === '1' ||
  process.env.EXPO_PUBLIC_DEV_MOCK_DATA === 'true' ||
  extra.EXPO_PUBLIC_DEV_MOCK_DATA === '1' ||
  extra.EXPO_PUBLIC_DEV_MOCK_DATA === 'true';

const WEATHER_DEFAULT_LAT = parseFloat(
  process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LAT ||
    (typeof extra.EXPO_PUBLIC_WEATHER_DEFAULT_LAT === 'string' ? extra.EXPO_PUBLIC_WEATHER_DEFAULT_LAT : '') ||
    '41.3851'
);
const WEATHER_DEFAULT_LON = parseFloat(
  process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LON ||
    (typeof extra.EXPO_PUBLIC_WEATHER_DEFAULT_LON === 'string' ? extra.EXPO_PUBLIC_WEATHER_DEFAULT_LON : '') ||
    '2.1734'
);

/**
 * Maps Platform key: Places (autocomplete), Geocoding (validate/save), Maps SDK (Android map).
 * Billing must be enabled; usage is metered — set budgets in Google Cloud. No usage = no charge beyond free tiers when applicable.
 */
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  (typeof extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY === 'string' ? extra.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : '') ||
  '';

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
    /** Native: Places autocomplete + Geocoding validation + Android Maps SDK when set. Web search still uses OSM (Places REST is not callable from browsers without a backend). */
    mapsApiKey: GOOGLE_MAPS_API_KEY,
    mapsConfigured: !!GOOGLE_MAPS_API_KEY,
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
