// Build iosUrlScheme from Web Client ID for Google Sign-In (iOS)
// EAS Build does not load .env when reading config, so we need a fallback
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '911980711702-2uoiec7qjhdqumf7ia1noa3u000qpklr.apps.googleusercontent.com';
const clientIdPart = webClientId.replace(/\.apps\.googleusercontent\.com$/, '');
const iosUrlScheme = `com.googleusercontent.apps.${clientIdPart}`;

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
      versionCode: 100,
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
      'expo-router',
      'expo-apple-authentication',
      [
        '@react-native-google-signin/google-signin',
        iosUrlScheme ? { iosUrlScheme } : {},
      ],
    ],
    experiments: { typedRoutes: true },
    extra: { router: {}, eas: { projectId: '404d9b3b-f97e-4bb7-bfd9-401fe830a759' } },
  },
};
