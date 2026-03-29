import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';

import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { requireAuth } from '../../server/lib/auth';
import { issueSessionAndUser } from '../../server/lib/authResponse';
import { allocateUniqueUsernameFromEmail } from '../../server/lib/usernameFromEmail';

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';

function serializeUser(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { ...rest, _id: _id instanceof ObjectId ? _id.toString() : _id };
}

// ------------------------
// Google auth (/auth/google)
// ------------------------
async function handleGoogle(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webClientId = process.env.GOOGLE_CLIENT_ID;
  const androidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
  const audiences = [webClientId, androidClientId].filter(
    (audience): audience is string => typeof audience === 'string' && audience.length > 0
  );
  if (audiences.length === 0) {
    return res.status(500).json({ error: 'Google auth not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { idToken } = body;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    const client = new OAuth2Client(webClientId || androidClientId);
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const email = payload.email;
    const firstName = payload.given_name || payload.name?.split(' ')[0] || '';
    const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '';

    const db = await getDb();
    const col = db.collection('users');
    let user = await col.findOne({ email });

    const now = new Date().toISOString();
    if (user) {
      const patch: Record<string, unknown> = {
        updatedAt: now,
        authProvider: 'google',
        firstName,
        lastName,
      };
      const existingUsername = (user as { username?: unknown }).username;
      if (typeof existingUsername !== 'string' || !existingUsername.trim()) {
        patch.username = await allocateUniqueUsernameFromEmail(col, email);
      }
      const uid = (user as { _id: ObjectId })._id;
      await col.updateOne({ _id: uid }, { $set: patch });
      user = await col.findOne({ _id: uid });
    } else {
      const username = await allocateUniqueUsernameFromEmail(col, email);
      const result = await col.insertOne({
        email,
        username,
        firstName,
        lastName,
        phone: '',
        authProvider: 'google',
        createdAt: now,
        updatedAt: now,
      });
      user = await col.findOne({ _id: result.insertedId });
    }

    const { user: u, accessToken } = await issueSessionAndUser(db, String((user as { _id: ObjectId })._id), email);
    return res.status(200).json({ ...u, accessToken });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ------------------------
// Me (/auth/me)
// ------------------------
async function handleMe(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json(serializeUser(user as Record<string, unknown>));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ------------------------
// Email auth (/auth/email?action=...)
// ------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(email: string): string | null {
  if (!EMAIL_REGEX.test(email)) return 'Email inválido';
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe tener al menos una mayúscula';
  if (!/[a-z]/.test(password)) return 'La contraseña debe tener al menos una minúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe tener al menos un número';
  return null;
}

async function checkRateLimit(
  db: Awaited<ReturnType<typeof getDb>>,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const col = db.collection('rate_limits');
  const now = Date.now();
  const doc = await col.findOne({ key });
  if (!doc || now - (doc.windowStart as number) > windowMs) {
    await col.updateOne({ key }, { $set: { key, count: 1, windowStart: now } }, { upsert: true });
    return true;
  }
  if ((doc.count as number) >= limit) return false;
  await col.updateOne({ key }, { $inc: { count: 1 } });
  return true;
}

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0] || 'unknown';
  return (req.socket as { remoteAddress?: string })?.remoteAddress || 'unknown';
}

async function handleSignup(req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
  const { email, password, firstName, lastName } = body as Record<string, string>;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const db = await getDb();
  const ok = await checkRateLimit(db, `signup:${getClientIp(req)}`, 5, 15 * 60 * 1000);
  if (!ok) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });

  const col = db.collection('users');

  const emailLower = email.toLowerCase();
  if (await col.findOne({ email: emailLower })) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const username = await allocateUniqueUsernameFromEmail(col, emailLower);

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();

  const result = await col.insertOne({
    email: emailLower,
    username,
    firstName,
    lastName,
    passwordHash,
    authProvider: 'email',
    phone: '',
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  const appUrl = process.env.APP_URL || 'https://matchpoint-neon-delta.vercel.app';
  const verifyToken = jwt.sign(
    { userId: result.insertedId.toString(), purpose: 'verify' },
    process.env.JWT_SECRET || 'matchpoint-reset-secret',
    { expiresIn: '24h' }
  );
  const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  if (emailUser && emailPass) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: emailUser, pass: emailPass },
    });
    await transporter.sendMail({
      from: `Matchpoint <${emailUser}>`,
      to: email,
      subject: 'Verificá tu email - Matchpoint',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#1a1a1a;padding:32px;border-radius:12px;">
        <h2 style="color:#fbbf24;">Verificá tu email</h2>
        <p style="color:#e5e5e5;">Hola ${firstName},</p>
        <p style="color:#a3a3a3;">Hacé click para confirmar tu cuenta en Matchpoint.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#fbbf24;color:#000;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;">Verificar email</a>
        <p style="color:#737373;font-size:12px;margin-top:24px;">© 2026 Miralab</p>
      </div>`,
    });
  }

  const { user, accessToken } = await issueSessionAndUser(db, result.insertedId.toString(), emailLower);
  return res.status(201).json({ ...user, accessToken });
}

async function handleLogin(req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
  const { identifier, password } = body as Record<string, string>;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username and password are required' });
  }

  const db = await getDb();
  const ip = getClientIp(req);
  const ok = await checkRateLimit(db, `login:${ip}`, 10, 15 * 60 * 1000);
  if (!ok) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });

  const col = db.collection('users');
  const lower = identifier.toLowerCase();

  const user = await col.findOne({
    $or: [{ email: lower }, { username: lower }],
    authProvider: 'email',
  });

  const passwordHash = (user as { passwordHash?: unknown } | null)?.passwordHash;
  if (!user || typeof passwordHash !== 'string' || !passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const now = new Date().toISOString();
  const uid = (user as { _id: ObjectId })._id;
  await col.updateOne({ _id: uid }, { $set: { updatedAt: now, lastLoginAt: now } });
  const emailStr = (user as { email?: string }).email;
  const { user: u, accessToken } = await issueSessionAndUser(db, String(uid), emailStr);
  const sessionExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return res.status(200).json({ ...u, accessToken, sessionExpiresAt });
}

async function handleForgotPassword(req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
  const { email } = body as Record<string, string>;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  const db = await getDb();
  const ok = await checkRateLimit(db, `forgot:${getClientIp(req)}`, 3, 60 * 60 * 1000);
  if (!ok) return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en 1 hora.' });

  const user = await db.collection('users').findOne({
    email: email.toLowerCase(),
    authProvider: 'email',
  });

  if (!user) {
    return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
  }

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  const jti = randomUUID();
  const token = jwt.sign(
    { userId: String((user as { _id: ObjectId })._id), email: (user as { email?: string }).email, jti },
    secret,
    { expiresIn: '1h' }
  );

  const appUrl = process.env.APP_URL || 'https://matchpoint-neon-delta.vercel.app';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (emailUser && emailPass) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: { user: emailUser, pass: emailPass },
    });

    await transporter.sendMail({
      from: `Matchpoint <${emailUser}>`,
      to: email,
      subject: 'Reset your Matchpoint password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #1a1a1a; padding: 32px; border-radius: 12px;">
          <h2 style="color: #fbbf24; margin-bottom: 8px;">Reset your password</h2>
          <p style="color: #e5e5e5;">Hi ${(user as { firstName?: string }).firstName ?? ''},</p>
          <p style="color: #a3a3a3;">We received a request to reset your Matchpoint password.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#fbbf24;color:#000;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:bold;margin:20px 0;">
            Reset Password
          </a>
          <p style="color:#737373;font-size:13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color:#737373;font-size:12px;margin-top:24px;">© 2026 Miralab</p>
        </div>
      `,
    });
  }

  return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
}

async function handleResetPassword(_req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
  const { token, password } = body as Record<string, string>;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  let payload: { userId: string; email: string; jti?: string };

  try {
    payload = jwt.verify(token, secret) as { userId: string; email: string; jti?: string };
  } catch {
    return res.status(401).json({ error: 'Invalid or expired reset token' });
  }

  const db = await getDb();
  if (payload.jti) {
    const used = await db.collection('used_reset_tokens').findOne({ jti: payload.jti });
    if (used) return res.status(401).json({ error: 'Este link ya fue usado. Pedí uno nuevo.' });
  }

  const col = db.collection('users');
  const user = await col.findOne({ _id: new ObjectId(payload.userId) });

  if (!user || (user as { authProvider?: string }).authProvider !== 'email') {
    return res.status(404).json({ error: 'User not found' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await col.updateOne({ _id: (user as { _id: ObjectId })._id }, { $set: { passwordHash, updatedAt: new Date().toISOString() } });
  if (payload.jti) {
    await db.collection('used_reset_tokens').insertOne({ jti: payload.jti, usedAt: new Date() });
  }

  return res.status(200).json({ message: 'Password updated successfully' });
}

async function handleChangePassword(body: Record<string, unknown>, res: VercelResponse) {
  const { userId, currentPassword, newPassword } = body as Record<string, string>;

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  const db = await getDb();
  const col = db.collection('users');
  const user = await col.findOne({ _id: new ObjectId(userId), authProvider: 'email' });

  const currentHash = (user as { passwordHash?: unknown } | null)?.passwordHash;
  if (!user || typeof currentHash !== 'string' || !currentHash) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(currentPassword, currentHash);
  if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await col.updateOne({ _id: (user as { _id: ObjectId })._id }, { $set: { passwordHash, updatedAt: new Date().toISOString() } });
  return res.status(200).json({ message: 'Contraseña actualizada' });
}

async function handleVerifyEmail(body: Record<string, unknown>, res: VercelResponse) {
  const { token } = body as Record<string, string>;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  let payload: { userId: string; purpose: string };
  try {
    payload = jwt.verify(token, secret) as { userId: string; purpose: string };
    if (payload.purpose !== 'verify') throw new Error('Invalid');
  } catch {
    return res.status(401).json({ error: 'Link expirado o inválido' });
  }

  const db = await getDb();
  const result = await db.collection('users').updateOne(
    { _id: new ObjectId(payload.userId) },
    { $set: { emailVerified: true, updatedAt: new Date().toISOString() } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.status(200).json({ message: 'Email verificado' });
}

async function handleEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query.action as string;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    switch (action) {
      case 'signup':
        return handleSignup(req, body, res);
      case 'login':
        return handleLogin(req, body, res);
      case 'forgot-password':
        return handleForgotPassword(req, body, res);
      case 'reset-password':
        return handleResetPassword(req, body, res);
      case 'change-password':
        return handleChangePassword(body, res);
      case 'verify-email':
        return handleVerifyEmail(body, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    console.error('Email auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  const corsRes = withCors(res);

  const raw = req.query.slug;
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const route = parts[0] ?? '';

  if (route === 'google') return handleGoogle(req, corsRes);
  if (route === 'email') return handleEmail(req, corsRes);
  if (route === 'me') return handleMe(req, corsRes);

  return corsRes.status(404).json({ error: 'Not found' });
}

