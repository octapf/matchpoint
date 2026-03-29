const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expo,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.expo/**',
      'babel.config.js',
      'metro.config.js',
      'scripts/**',
    ],
  },
]);
