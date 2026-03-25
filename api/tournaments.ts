import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import {
  buildInviteOgHtml,
  injectInviteOgIntoIndexHtml,
  parseOgLang,
  siteOrigin,
} from '../server/lib/inviteOgHtml';

async function fetchDeployedIndexHtml(origin: string): Promise<string | null> {
  for (const path of ['/index.html', '/']) {
    try {
      const r = await fetch(`${origin}${path}`, {
        headers: { Accept: 'text/html' },
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const text = await r.text();
      if (text.includes('id="root"') && text.includes('og:title')) {
        return text;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(res).end();

  const corsRes = withCors(res);
  try {
    const db = await getDb();
    const col = db.collection('tournaments');

    if (req.method === 'GET') {
      const q = req.query;
      const status = typeof q.status === 'string' ? q.status : undefined;
      const organizerId = typeof q.organizerId === 'string' ? q.organizerId : undefined;
      const inviteRaw = q.inviteLink;
      const inviteLink =
        typeof inviteRaw === 'string' ? inviteRaw : Array.isArray(inviteRaw) ? inviteRaw[0] : undefined;
      const ogWant = q.og === '1' || q.og === 'true';

      const hasStatus = !!status;
      const hasOrg = !!organizerId;
      const hasInvite = typeof inviteLink === 'string' && inviteLink.length > 0;

      // Exact invite token: one document only (avoids wrong row when sort/duplicates differ from sharer's tournament).
      if (hasInvite && !hasStatus && !hasOrg) {
        const token = inviteLink.trim();
        const doc = await col.findOne({ inviteLink: token });
        if (ogWant) {
          const lang = parseOgLang(q.lang);
          const origin = siteOrigin();
          const shell = await fetchDeployedIndexHtml(origin);
          const html = shell
            ? injectInviteOgIntoIndexHtml(shell, doc, token, lang)
            : buildInviteOgHtml(doc, token, lang);
          return corsRes
            .status(200)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')
            .send(html);
        }
        return corsRes.status(200).json(doc ? [serializeDoc(doc as Record<string, unknown>)] : []);
      }

      const filter: Record<string, unknown> = {};
      if (hasStatus) filter.status = status;
      if (hasOrg) filter.organizerIds = { $in: [organizerId] };
      if (hasInvite) filter.inviteLink = inviteLink.trim();

      const docs = await col.find(filter).sort({ startDate: 1, date: 1 }).toArray();
      return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, date, startDate, endDate, location, description, maxTeams, inviteLink, organizerIds } = body;
      const sDate = startDate || date;
      const eDate = endDate || date || sDate;
      if (!name || !sDate || !location || !maxTeams || !inviteLink || !organizerIds?.length) {
        return corsRes.status(400).json({ error: 'Missing required fields' });
      }
      if (eDate < sDate) {
        return corsRes.status(400).json({ error: 'End date must be on or after start date' });
      }
      const now = new Date().toISOString();
      const doc = {
        name,
        date: sDate,
        startDate: sDate,
        endDate: eDate,
        location,
        description: description || '',
        maxTeams: Number(maxTeams),
        inviteLink,
        status: 'open',
        organizerIds: Array.isArray(organizerIds) ? organizerIds : [organizerIds],
        createdAt: now,
        updatedAt: now,
      };
      const result = await col.insertOne(doc);
      const inserted = await col.findOne({ _id: result.insertedId });
      return corsRes.status(201).json(serializeDoc(inserted as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
