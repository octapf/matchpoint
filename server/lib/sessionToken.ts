import jwt from 'jsonwebtoken';

const TYP = 'session';

export function signSessionToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  return jwt.sign({ sub: userId, typ: TYP }, secret, { expiresIn: '30d', algorithm: 'HS256' });
}

export function verifySessionToken(token: string): { sub: string } | null {
  try {
    const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
    const decoded = jwt.verify(token, secret) as { sub?: string; typ?: string };
    if (decoded.typ !== TYP || typeof decoded.sub !== 'string') return null;
    return { sub: decoded.sub };
  } catch {
    return null;
  }
}
