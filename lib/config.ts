/**
 * API configuration - uses Expo's EXPO_PUBLIC_ for client-side env vars
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const INVITE_BASE_URL = process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'https://matchpoint.miralab.ar';

export const config = {
  api: {
    baseUrl: API_URL,
    isConfigured: !!API_URL,
  },
  google: {
    clientId: GOOGLE_CLIENT_ID,
    /** Required on Android for expo-auth-session. Falls back to web clientId to avoid crash. */
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_CLIENT_ID,
    isConfigured: !!GOOGLE_CLIENT_ID,
  },
  invite: {
    baseUrl: INVITE_BASE_URL,
    /** Full URL for sharing: https://matchpoint.miralab.ar/t/{token} */
    getUrl: (token: string) => `${INVITE_BASE_URL}/t/${token}`,
  },
};
