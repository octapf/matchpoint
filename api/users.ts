import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDb } from '../server/lib/mongodb';
import { withCors } from '../server/lib/cors';
import { getSessionUserId, isUserAdmin } from '../server/lib/auth';
import { isValidUsername, normalizeUsername } from '../server/lib/usernameRules';
import { userPatchSchema } from '../server/lib/schemas/userPatch';

function serializeDoc(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash: _ph, ...rest } = doc;
  return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
}

/** Peers / non-admins: no email, phone, or role (avoid leaking PII and admin status). Phone only if `phoneVisible`. */
function toPublicUser(doc: Record<string, unknown>) {
  const s = serializeDoc(doc);
  if (!s) return null;
  const { email: _e, phone: _p, role: _r, phoneVisible: _pv, ...pub } = s as Record<string, unknown>;
  const out = { ...pub } as Record<string, unknown>;
  if (doc.phoneVisible === true && typeof doc.phone === 'string' && doc.phone.trim()) {
    out.phone = doc.phone.trim();
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return withCors(req, res).end();

  const corsRes = withCors(req, res);
  try {
    const db = await getDb();
    const col = db.collection('users');

    if (req.method === 'GET') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      if (!ObjectId.isValid(actorId)) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const actor = await col.findOne({ _id: new ObjectId(actorId) });
      if (!actor) return corsRes.status(401).json({ error: 'Invalid session' });
      const admin = isUserAdmin(actor as { role?: string; email?: string });

      const { id, email, ids } = req.query;
      const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';

      if (type === 'notifications') {
        const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '';
        const limit = Math.max(1, Math.min(50, Math.floor(Number(limitRaw || 30) || 30)));
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : '';

        const ncol = db.collection('notifications');
        const filter: Record<string, unknown> = { userId: actorId };
        if (cursor) {
          // cursor is an ISO timestamp (createdAt) for pagination
          filter.createdAt = { $lt: cursor };
        }
        const rows = await ncol
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();
        return corsRes.status(200).json(
          rows.map((d) => {
            const plain = d as Record<string, unknown>;
            const { _id, ...rest } = plain;
            return { _id: (_id as ObjectId).toString(), ...rest };
          })
        );
      }

      if (ids && typeof ids === 'string') {
        const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
        const validIds = idList.filter((s) => ObjectId.isValid(s));
        if (validIds.length === 0) return corsRes.status(200).json([]);
        const docs = await col.find({ _id: { $in: validIds.map((s) => new ObjectId(s)) } }).toArray();
        if (admin) {
          return corsRes.status(200).json(docs.map((d) => serializeDoc(d as Record<string, unknown>)));
        }
        return corsRes.status(200).json(
          docs.map((d) => {
            const plain = d as Record<string, unknown>;
            const sid = (plain._id as ObjectId).toString();
            if (sid === actorId) return serializeDoc(plain);
            return toPublicUser(plain);
          })
        );
      }

      if (id && typeof id === 'string' && ObjectId.isValid(id)) {
        const doc = await col.findOne({ _id: new ObjectId(id) });
        if (!doc) return corsRes.status(404).json({ error: 'User not found' });
        const plain = doc as Record<string, unknown>;
        if (admin || id === actorId) {
          return corsRes.status(200).json(serializeDoc(plain));
        }
        return corsRes.status(200).json(toPublicUser(plain));
      }

      if (email && typeof email === 'string') {
        if (!admin) {
          return corsRes.status(403).json({ error: 'Forbidden' });
        }
        const doc = await col.findOne({ email });
        if (!doc) return corsRes.status(404).json({ error: 'User not found' });
        return corsRes.status(200).json(serializeDoc(doc as Record<string, unknown>));
      }

      return corsRes.status(400).json({ error: 'Provide id, email, or ids' });
    }

    if (req.method === 'POST') {
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      if (!ObjectId.isValid(actorId)) {
        return corsRes.status(401).json({ error: 'Invalid session' });
      }
      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const action = typeof raw?.action === 'string' ? raw.action.trim() : '';
      const ncol = db.collection('notifications');
      const now = new Date().toISOString();

      if (action === 'notifications.markRead') {
        const ids: string[] = Array.isArray(raw?.ids)
          ? (raw.ids as unknown[]).map((x) => String(x)).filter(Boolean)
          : [];
        const valid = ids.filter((s: string) => ObjectId.isValid(s));
        if (valid.length === 0) return corsRes.status(200).json({ ok: true, updated: 0 });
        const r = await ncol.updateMany(
          { _id: { $in: valid.map((s: string) => new ObjectId(s)) }, userId: actorId, readAt: null },
          { $set: { readAt: now } }
        );
        return corsRes.status(200).json({ ok: true, updated: r.modifiedCount ?? 0 });
      }

      if (action === 'notifications.markAllRead') {
        const r = await ncol.updateMany({ userId: actorId, readAt: null }, { $set: { readAt: now } });
        return corsRes.status(200).json({ ok: true, updated: r.modifiedCount ?? 0 });
      }

      return corsRes.status(400).json({ error: 'Invalid action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || typeof id !== 'string' || !ObjectId.isValid(id)) {
        return corsRes.status(400).json({ error: 'Invalid user ID' });
      }
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const actor = await col.findOne({ _id: new ObjectId(actorId) });
      if (!actor) return corsRes.status(401).json({ error: 'Invalid session' });
      const selfDelete = actorId === id;
      const admin = isUserAdmin(actor as { role?: string; email?: string });
      if (!selfDelete && !admin) {
        return corsRes.status(403).json({ error: 'Forbidden' });
      }

      const oid = new ObjectId(id);
      const existing = await col.findOne({ _id: oid });
      if (!existing) return corsRes.status(404).json({ error: 'User not found' });

      // Soft-delete: keep historical data so accounts can be recovered later.
      const now = new Date().toISOString();
      const alreadyDeletedAt = (existing as { deletedAt?: unknown }).deletedAt;
      if (alreadyDeletedAt) {
        return corsRes.status(204).end();
      }
      await col.updateOne(
        { _id: oid },
        {
          $set: {
            deletedAt: now,
            updatedAt: now,
            deletedBy: admin && actorId !== id ? actorId : id,
          },
        }
      );
      return corsRes.status(204).end();
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id || typeof id !== 'string' || !ObjectId.isValid(id)) {
        return corsRes.status(400).json({ error: 'Invalid user ID' });
      }
      const actorId = getSessionUserId(req);
      if (!actorId) {
        return corsRes.status(401).json({ error: 'Authentication required' });
      }
      const actor = await col.findOne({ _id: new ObjectId(actorId) });
      if (!actor) return corsRes.status(401).json({ error: 'Invalid session' });
      const selfEdit = actorId === id;
      const admin = isUserAdmin(actor as { role?: string; email?: string });
      if (!selfEdit && !admin) {
        return corsRes.status(403).json({ error: 'Forbidden' });
      }

      const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const parsed = userPatchSchema.safeParse(raw);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const hint = first ? ` (${first.path.join('.') || 'body'}: ${first.message})` : '';
        return corsRes.status(400).json({ error: `Invalid payload${hint}` });
      }
      const body = parsed.data as Record<string, unknown>;
      const allowed = ['firstName', 'lastName', 'phone', 'gender', 'themePresetId'];
      if (admin) allowed.push('role');
      const update: Record<string, unknown> = {};
      if (body.username !== undefined) {
        const normalized = normalizeUsername(String(body.username));
        if (!isValidUsername(normalized)) {
          return corsRes.status(400).json({
            error: 'Username must be 3–24 characters: letters, numbers, underscores only',
          });
        }
        const taken = await col.findOne({
          username: normalized,
          _id: { $ne: new ObjectId(id) },
        });
        if (taken) {
          return corsRes.status(409).json({ error: 'Username already taken' });
        }
        update.username = normalized;
      }
      for (const k of allowed) {
        if (body[k] !== undefined) update[k] = body[k];
      }
      if (selfEdit && body.phoneVisible !== undefined) {
        update.phoneVisible = Boolean(body.phoneVisible);
      }
      // Only accept male/female for gender; ignore 'other' or invalid values
      if ('gender' in body && body.gender !== 'male' && body.gender !== 'female') {
        delete update.gender;
      }
      if (update.role !== undefined) {
        const r = update.role;
        if (r !== 'user' && r !== 'admin') {
          delete update.role;
        }
      }
      if (Object.keys(update).length === 0) {
        return corsRes.status(400).json({ error: 'No valid fields to update' });
      }
      update.updatedAt = new Date().toISOString();
      const mongoOp: { $set: Record<string, unknown>; $unset?: Record<string, string> } = {
        $set: update,
      };
      if (body.username !== undefined) {
        mongoOp.$unset = { displayName: '' };
      }
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(id) },
        mongoOp,
        { returnDocument: 'after' }
      );
      if (!result) return corsRes.status(404).json({ error: 'User not found' });
      return corsRes.status(200).json(serializeDoc(result as Record<string, unknown>));
    }

    return corsRes.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return corsRes.status(500).json({ error: 'Internal server error' });
  }
}
