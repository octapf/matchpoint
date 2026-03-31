/** Parse list query params with safe caps (default limit 200, max 500). */
export function parseLimitOffset(query: {
  limit?: string | string[] | undefined;
  offset?: string | string[] | undefined;
}): { limit: number; offset: number } {
  const rawL = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const rawO = Array.isArray(query.offset) ? query.offset[0] : query.offset;
  const defaultLimit = 200;
  const maxLimit = 500;
  const parsedL = parseInt(String(rawL ?? defaultLimit), 10);
  const parsedO = parseInt(String(rawO ?? '0'), 10);
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(parsedL) ? parsedL : defaultLimit));
  const offset = Math.max(0, Number.isFinite(parsedO) ? parsedO : 0);
  return { limit, offset };
}
