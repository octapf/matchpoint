const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Optional native packages (Rollup/Esbuild) for other OS/arch can leave stale paths or
// symlinks on Windows; Metro's FallbackWatcher then throws ENOENT when calling fs.watch.
// If you see ENOENT on @tybys/wasm-util/.../wasi, ensure devDependency @tybys/wasm-util is installed
// (npm omits it when @napi-rs/wasm-runtime is skipped as optional).
// These patterns match absolute paths (backslashes normalized to / before test).
const optionalNativeToolingBlockList = [
  /[/\\]node_modules[/\\]@rollup[/\\]rollup-(linux|darwin|android|freebsd|openbsd|openharmony)-/,
  /[/\\]node_modules[/\\]@esbuild[/\\](linux|android|darwin|freebsd|netbsd|openbsd|sunos|aix)-/,
];
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  ...optionalNativeToolingBlockList,
];

// Fix TanStack Query resolution with Metro/React Native
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'cjs'];

// Fix: Zustand ESM bundle uses import.meta which Metro doesn't support on web
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
