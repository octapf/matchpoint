/**
 * JWT signing secret — must be set on Vercel and for any non-local API run.
 * Never use the dev fallback in production or preview deployments.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (s) return s;

  const onVercel = !!process.env.VERCEL;
  if (onVercel) {
    throw new Error('JWT_SECRET is required (set in Vercel → Environment Variables)');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }

  console.warn(
    '[matchpoint] JWT_SECRET not set — using dev-only default. Set JWT_SECRET in .env for real deployments.'
  );
  return '__matchpoint_dev_only_jwt_secret_not_for_production__';
}
