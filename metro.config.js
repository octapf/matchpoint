const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix TanStack Query resolution with Metro/React Native
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'cjs'];

// Fix: Zustand ESM bundle uses import.meta which Metro doesn't support on web
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
