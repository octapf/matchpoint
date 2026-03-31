/**
 * CORS + baseline security headers for Vercel API routes.
 *
 * - `CORS_ALLOWED_ORIGINS`: comma-separated list (e.g. `https://app.example.com,https://matchpoint.vercel.app`).
 *   If set, requests whose `Origin` header matches an entry get that origin echoed; others get `*`.
 *   Mobile clients often omit `Origin`; they still receive `*` and work with Bearer auth.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Bump when response shapes change in a breaking way; clients may read `X-Matchpoint-Api-Version`. */
export const MATCHPOINT_API_VERSION = '1';

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Matchpoint-Api-Version': MATCHPOINT_API_VERSION,
};

function parseAllowedOrigins(): string[] | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveAllowOrigin(req: VercelRequest): string {
  const allowed = parseAllowedOrigins();
  if (!allowed || allowed.length === 0) {
    return '*';
  }
  const origin = req.headers.origin;
  if (typeof origin === 'string' && allowed.includes(origin)) {
    return origin;
  }
  return '*';
}

function applyHeaders(res: VercelResponse, req: VercelRequest): void {
  const allowOrigin = resolveAllowOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  if (allowOrigin !== '*') {
    res.setHeader('Vary', 'Origin');
  }
  Object.entries(BASE_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

/**
 * Attach CORS + security headers. Pass the incoming request so Origin can be validated when configured.
 */
export function withCors(req: VercelRequest, res: VercelResponse): VercelResponse {
  applyHeaders(res, req);
  return res;
}
