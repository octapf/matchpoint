import type { VercelRequest, VercelResponse } from '@vercel/node';
import authHandler from './auth/[...slug]';

/**
 * Stable auth entrypoint for Vercel aliases/custom domains.
 * Rewrites map /api/auth/:route -> /api/auth?slug=:route.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return authHandler(req, res);
}
