// Build iosUrlScheme from Web Client ID for Google Sign-In (iOS)
// EAS Build does not load .env when reading config, so we need a fallback
const FALLBACK_WEB_CLIENT_ID =
  '911980711702-2uoiec7qjhdqumf7ia1noa3u000qpklr.apps.googleusercontent.com';
const FALLBACK_ANDROID_CLIENT_ID =
  '911980711702-s71t94rbfbjrh31du857v6rkeieidpq4.apps.googleusercontent.com';
/** Same default as `eas.json` — local Gradle builds do not load `.env`, so `extra` must carry a non-empty URL. */
const FALLBACK_API_URL = 'https://matchpoint-neon-delta.vercel.app';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || FALLBACK_WEB_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || FALLBACK_ANDROID_CLIENT_ID;
const clientIdPart = webClientId.replace(/\.apps\.googleusercontent\.com$/, '');
const iosUrlScheme = `com.googleusercontent.apps.${clientIdPart}`;
/** Injected for Android Google MapView (venue detail). Enable Maps SDK for Android on this key. */
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = {
  expo: {
    name: 'Matchpoint',
    slug: 'matchpoint',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'com.miralab.matchpoint',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#2b2b33',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.miralab.matchpoint',
    },
    android: {
      package: 'com.miralab.matchpoint',
      /** Must stay above the Play Store build to allow `expo run:android` over store installs */
      versionCode: 102,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: false,
          data: [
            { scheme: 'com.miralab.matchpoint', pathPrefix: '/' },
            { scheme: 'com.miralab.matchpoint', pathPrefix: '/oauthredirect' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        /** HTTPS invite links → native app (requires /.well-known/assetlinks.json + matching SHA256). */
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'matchpoint.miralab.ar',
              pathPrefix: '/t',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
      adaptiveIcon: {
        backgroundColor: '#2b2b33',
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
      /** `single` omits app/+html.tsx from exported index.html — no og:image for WhatsApp. Use static for real <head> + SEO. */
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      ['expo-dev-client', { launchMode: 'launcher' }],
      ['expo-router', { origin: 'https://matchpoint.miralab.ar' }],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Matchpoint uses your location for weather on the Feed and to set tournament venues.',
        },
      ],
      ...(googleMapsApiKey
        ? [
            [
              'react-native-maps',
              {
                androidGoogleMapsApiKey: googleMapsApiKey,
              },
            ],
          ]
        : []),
      [
        '@react-native-google-signin/google-signin',
        iosUrlScheme ? { iosUrlScheme } : {},
      ],
      '@sentry/react-native',
    ],
    experiments: { typedRoutes: true },
    extra: {
      router: {},
      eas: { projectId: '404d9b3b-f97e-4bb7-bfd9-401fe830a759' },
      /**
       * Build-time injected public env vars. We mirror EXPO_PUBLIC_* here so runtime
       * config can fall back when `process.env` isn't inlined (e.g. local Gradle builds).
       */
      EXPO_PUBLIC_GOOGLE_CLIENT_ID: webClientId,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: androidClientId,
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_URL,
      EXPO_PUBLIC_INVITE_BASE_URL: process.env.EXPO_PUBLIC_INVITE_BASE_URL || 'https://matchpoint.miralab.ar',
      EXPO_PUBLIC_DEV_MOCK_DATA: process.env.EXPO_PUBLIC_DEV_MOCK_DATA || '',
      EXPO_PUBLIC_WEATHER_DEFAULT_LAT: process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LAT || '',
      EXPO_PUBLIC_WEATHER_DEFAULT_LON: process.env.EXPO_PUBLIC_WEATHER_DEFAULT_LON || '',
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    },
  },
};
