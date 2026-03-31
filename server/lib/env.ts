/**
 * Server-side environment checks (fail fast in health checks).
 */
export function isMongoConfigured(): boolean {
  return typeof process.env.MONGODB_URI === 'string' && process.env.MONGODB_URI.trim().length > 0;
}

export function getDeploymentRevision(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.npm_package_version ||
    'dev'
  );
}
