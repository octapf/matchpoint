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
