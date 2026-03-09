const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix TanStack Query resolution with Metro/React Native
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'cjs'];

module.exports = config;
