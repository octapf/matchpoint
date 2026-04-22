const HEX24 = /^[a-f0-9]{24}$/i;

/**
 * Normalize Mongo ObjectId values from JSON (hex string, Extended JSON `{ "$oid" }`, or BSON ObjectId in Node)
 * so map lookups stay consistent across the client and server.
 */
export function normalizeMongoIdString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const s = raw.trim();
    return HEX24.test(s) ? s.toLowerCase() : s;
  }
  if (typeof raw === 'object' && raw !== null) {
    const oid = (raw as { $oid?: unknown }).$oid;
    if (typeof oid === 'string' && oid.trim()) {
      const s = oid.trim();
      return HEX24.test(s) ? s.toLowerCase() : s;
    }
    const toHex = (raw as { toHexString?: () => string }).toHexString;
    if (typeof toHex === 'function') {
      try {
        const s = String(toHex.call(raw)).trim();
        return HEX24.test(s) ? s.toLowerCase() : s;
      } catch {
        return '';
      }
    }
  }
  const s = String(raw).trim();
  return HEX24.test(s) ? s.toLowerCase() : s;
}
