import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClientIp } from './clientIp';

type Bucket = { resetAt: number; count: number };

const store = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
let sweep = 0;

function gc(): void {
  const now = Date.now();
  if (store.size < 2_000 || now - sweep < 30_000) return;
  sweep = now;
  for (const [k, v] of store.entries()) {
    if (v.resetAt <= now) store.delete(k);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Sliding-window rate limiter (per serverless instance). For distributed limits use Upstash Redis.
 */
export function checkRateLimit(
  req: VercelRequest,
  keyPrefix: string,
  maxPerWindow: number,
  windowMs: number = WINDOW_MS
): RateLimitResult {
  gc();
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt <= now) {
    b = { resetAt: now + windowMs, count: 0 };
    store.set(key, b);
  }
  b.count += 1;
  if (b.count > maxPerWindow) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

export function rateLimitJson(
  req: VercelRequest,
  res: VercelResponse,
  keyPrefix: string,
  maxPerWindow: number,
  windowMs?: number
): boolean {
  const r = checkRateLimit(req, keyPrefix, maxPerWindow, windowMs);
  if (r.ok) return true;
  res.setHeader('Retry-After', String(r.retryAfterSec));
  res.status(429).json({ error: 'Too many requests' });
  return false;
}
