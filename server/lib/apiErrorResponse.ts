/**
 * Uncaught API handler errors: structured logs + optional JSON detail (never in production by default).
 */

function errorParts(err: unknown): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Include `debugMessage` / `debugStack` on 500 JSON when:
 * - `vercel dev` (VERCEL_ENV=development), or
 * - Node not in production (local tsx, tests), or
 * - Explicit `EXPOSE_API_ERROR_DETAIL=1` (e.g. preview debugging — use briefly).
 */
export function exposeApiErrorDetail(): boolean {
  if (process.env.EXPOSE_API_ERROR_DETAIL === '1' || process.env.EXPOSE_API_ERROR_DETAIL === 'true') {
    return true;
  }
  if (process.env.VERCEL_ENV === 'development') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

/** One-line JSON log for Vercel / log drains (search by route + level). */
export function logApiHandlerError(
  route: string,
  context: Record<string, unknown>,
  err: unknown
): void {
  const parts = errorParts(err);
  const line = JSON.stringify({
    level: 'error',
    scope: 'api',
    route,
    ...context,
    errName: parts.name,
    errMessage: parts.message,
    errStack: parts.stack,
  });
  console.error(line);
}

export function jsonBodyForServerError(err: unknown): {
  error: string;
  debugMessage?: string;
  debugStack?: string;
} {
  const body: { error: string; debugMessage?: string; debugStack?: string } = {
    error: 'Internal server error',
  };
  if (!exposeApiErrorDetail()) return body;
  const parts = errorParts(err);
  body.debugMessage = parts.message;
  if (parts.stack) body.debugStack = parts.stack;
  return body;
}
