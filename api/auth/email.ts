import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../../server/lib/mongodb';
import { withCors } from '../../server/lib/cors';
import { issueSessionAndUser } from '../../server/lib/authResponse';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

function validateEmail(email: string): string | null {
  if (!EMAIL_REGEX.test(email)) return 'Email inválido';
  return null;
}

function validateUsername(username: string): string | null {
  if (username.length < 3) return 'El usuario debe tener al menos 3 caracteres';
  if (!USERNAME_REGEX.test(username)) return 'Solo letras, números y guión bajo (3-24 caracteres)';
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

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

async function handleSignup(req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
  const { email, username, password, firstName, lastName } = body as Record<string, string>;

  if (!email || !username || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const userErr = validateUsername(username);
  if (userErr) return res.status(400).json({ error: userErr });
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const db = await getDb();
  const ok = await checkRateLimit(db, `signup:${getClientIp(req)}`, 5, 15 * 60 * 1000);
  if (!ok) return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });

  const col = db.collection('users');

  if (await col.findOne({ email: email.toLowerCase() })) {
    return res.status(409).json({ error: 'Email already in use' });
  }
  if (await col.findOne({ username: username.toLowerCase() })) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();

  const result = await col.insertOne({
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    firstName,
    lastName,
    passwordHash,
    authProvider: 'email',
    phone: '',
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  // Send verification email
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
    const transporter = nodemailer.createTransport({ host: 'smtp.zoho.com', port: 465, secure: true, auth: { user: emailUser, pass: emailPass } });
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

  const { user, accessToken } = await issueSessionAndUser(db, result.insertedId.toString(), email.toLowerCase());
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

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash as string);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const now = new Date().toISOString();
  const sessionExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  await col.updateOne({ _id: user._id }, { $set: { updatedAt: now, lastLoginAt: now } });
  const emailStr = user.email as string | undefined;
  const { user: u, accessToken } = await issueSessionAndUser(db, String(user._id), emailStr);
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
  const ok = await checkRateLimit(db, `forgot:${getClientIp(req)}`, 3, 60 * 60 * 1000); // 3 per hour
  if (!ok) return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en 1 hora.' });

  const user = await db.collection('users').findOne({
    email: email.toLowerCase(),
    authProvider: 'email',
  });

  // Always return success to avoid email enumeration
  if (!user) {
    return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
  }

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  const jti = randomUUID();
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, jti },
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
          <p style="color: #e5e5e5;">Hi ${user.firstName},</p>
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

async function handleResetPassword(req: VercelRequest, body: Record<string, unknown>, res: VercelResponse) {
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

  if (!user || user.authProvider !== 'email') {
    return res.status(404).json({ error: 'User not found' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await col.updateOne(
    { _id: user._id },
    { $set: { passwordHash, updatedAt: new Date().toISOString() } }
  );
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

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash as string);
  if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await col.updateOne(
    { _id: user._id },
    { $set: { passwordHash, updatedAt: new Date().toISOString() } }
  );
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const action = req.query.action as string;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});

    switch (action) {
      case 'signup':         return handleSignup(req, body, corsRes);
      case 'login':          return handleLogin(req, body, corsRes);
      case 'forgot-password': return handleForgotPassword(req, body, corsRes);
      case 'reset-password': return handleResetPassword(req, body, corsRes);
      case 'change-password': return handleChangePassword(body, corsRes);
      case 'verify-email': return handleVerifyEmail(body, corsRes);
      default:
        return corsRes.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    console.error('Email auth error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
