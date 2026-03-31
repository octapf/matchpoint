import type { VercelRequest } from '@vercel/node';

/** Best-effort client IP for rate limiting (Vercel sets x-forwarded-for). */
export function getClientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(',')[0]!.trim();
  }
  const socket = (req as { socket?: { remoteAddress?: string } }).socket;
  return socket?.remoteAddress ?? 'unknown';
}
