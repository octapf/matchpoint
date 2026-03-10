// Build iosUrlScheme from Web Client ID for Google Sign-In (iOS)
// EAS Build does not load .env when reading config, so we need a fallback
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '911980711702-2uoiec7qjhdqumf7ia1noa3u000qpklr.apps.googleusercontent.com';
const clientIdPart = webClientId.replace(/\.apps\.googleusercontent\.com$/, '');
const iosUrlScheme = `com.googleusercontent.apps.${clientIdPart}`;

module.exports = {
  expo: {
    name: 'matchpoint',
    slug: 'matchpoint',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'com.miralab.matchpoint',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.miralab.matchpoint',
    },
    android: {
      package: 'com.miralab.matchpoint',
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
      ],
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
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
