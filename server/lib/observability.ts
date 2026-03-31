/**
 * Structured API logging (extend with Sentry/Datadog by wrapping logApi).
 * Avoid logging PII or full request bodies.
 */
type LogLevel = 'info' | 'warn' | 'error';

export function logApi(
  level: LogLevel,
  message: string,
  fields?: Record<string, string | number | boolean | undefined>
): void {
  const payload = {
    ts: new Date().toISOString(),
    msg: message,
    ...Object.fromEntries(
      Object.entries(fields ?? {}).filter(([, v]) => v !== undefined)
    ),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

let sentryInit: Promise<void> | null = null;

/** Optional Sentry: set `SENTRY_DSN` (and `SENTRY_ENVIRONMENT` / `VERCEL_ENV`) on the server. */
export function captureException(err: unknown, context?: Record<string, string>): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (!sentryInit) {
    sentryInit = import('@sentry/node').then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
        tracesSampleRate: 0,
      });
    });
  }
  void sentryInit
    .then(() => import('@sentry/node'))
    .then((Sentry) => {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        extra: context,
      });
    })
    .catch(() => {
      /* optional dependency */
    });
}
