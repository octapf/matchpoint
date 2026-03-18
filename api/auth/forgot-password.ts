import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getDb } from '../lib/mongodb';
import { withCors } from '../lib/cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();
  if (req.method !== 'POST') return withCors(res).status(405).json({ error: 'Method not allowed' });

  const corsRes = withCors(res);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email } = body;

    if (!email) {
      return corsRes.status(400).json({ error: 'Email is required' });
    }

    const db = await getDb();
    const user = await db.collection('users').findOne({
      email: email.toLowerCase(),
      authProvider: 'email',
    });

    // Always return success to avoid email enumeration
    if (!user) {
      return corsRes.status(200).json({ message: 'If that email exists, a reset link was sent' });
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

    return corsRes.status(200).json({ message: 'If that email exists, a reset link was sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
