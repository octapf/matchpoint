const HEX24 = /^[a-f0-9]{24}$/i;

export function isValidMongoObjectIdHex(s: unknown): boolean {
  return typeof s === 'string' && HEX24.test(s.trim());
}

/**
 * 12 random bytes as a 24-hex string (valid Mongo ObjectId shape) for optimistic client rows.
 * Uses `crypto.getRandomValues` when available (Expo / modern runtimes).
 */
export function randomHexObjectId24(): string {
  const bytes = new Uint8Array(12);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
