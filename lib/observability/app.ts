import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

declare const __DEV__: boolean;

function hasSentryDsn(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);
}

export function initAppObservability(): void {
  if (__DEV__) return;
  if (Platform.OS === 'web') return;
  if (!hasSentryDsn()) return;

  const key = '__matchpoint_sentry_inited__';
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[key]) return;
  g[key] = true;

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
    enableNative: true,
  });
}

export function captureAppException(
  err: unknown,
  context?: Record<string, string | number | boolean | null | undefined>
): void {
  if (__DEV__) return;
  if (Platform.OS === 'web') return;
  if (!hasSentryDsn()) return;

  Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
    extra: context,
  });
}

