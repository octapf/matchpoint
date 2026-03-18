import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

async function handleSignup(body: Record<string, unknown>, res: VercelResponse) {
  const { email, username, password, firstName, lastName } = body as Record<string, string>;

  if (!email || !username || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = await getDb();
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
    createdAt: now,
    updatedAt: now,
  });

  const user = await col.findOne({ _id: result.insertedId });
  return res.status(201).json(serializeDoc(user as Record<string, unknown>));
}

async function handleLogin(body: Record<string, unknown>, res: VercelResponse) {
  const { identifier, password } = body as Record<string, string>;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/username and password are required' });
  }

  const db = await getDb();
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
  await col.updateOne({ _id: user._id }, { $set: { updatedAt: now } });
  const updated = await col.findOne({ _id: user._id });

  return res.status(200).json(serializeDoc(updated as Record<string, unknown>));
}

async function handleForgotPassword(body: Record<string, unknown>, res: VercelResponse) {
  const { email } = body as Record<string, string>;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const db = await getDb();
  const user = await db.collection('users').findOne({
    email: email.toLowerCase(),
    authProvider: 'email',
  });

  // Always return success to avoid email enumeration
  if (!user) {
    return res.status(200).json({ message: 'If that email exists, a reset link was sent' });
  }

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email },
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

async function handleResetPassword(body: Record<string, unknown>, res: VercelResponse) {
  const { token, password } = body as Record<string, string>;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const secret = process.env.JWT_SECRET || 'matchpoint-reset-secret';
  let payload: { userId: string; email: string };

  try {
    payload = jwt.verify(token, secret) as { userId: string; email: string };
  } catch {
    return res.status(401).json({ error: 'Invalid or expired reset token' });
  }

  const db = await getDb();
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

  return res.status(200).json({ message: 'Password updated successfully' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);
  const action = req.query.action as string;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});

    switch (action) {
      case 'signup':         return handleSignup(body, corsRes);
      case 'login':          return handleLogin(body, corsRes);
      case 'forgot-password': return handleForgotPassword(body, corsRes);
      case 'reset-password': return handleResetPassword(body, corsRes);
      default:
        return corsRes.status(400).json({ error: 'Invalid action. Use ?action=signup|login|forgot-password|reset-password' });
    }
  } catch (err) {
    console.error('Email auth error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
