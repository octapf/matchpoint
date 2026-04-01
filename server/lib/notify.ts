import type { Db } from 'mongodb';

export type NotifyPayload = {
  userId: string;
  type: string;
  params?: Record<string, string | number | boolean>;
  data?: Record<string, unknown>;
  /**
   * If set, used to de-duplicate notifications for the same user.
   * Example: `match.started:<matchId>`
   */
  dedupeKey?: string;
};

export async function notifyOne(db: Db, payload: NotifyPayload): Promise<void> {
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    userId: payload.userId,
    type: payload.type,
    params: payload.params ?? {},
    data: payload.data ?? {},
    dedupeKey: payload.dedupeKey ?? null,
    readAt: null,
    createdAt: now,
  };

  const col = db.collection('notifications');
  if (payload.dedupeKey) {
    await col.updateOne(
      { userId: payload.userId, dedupeKey: payload.dedupeKey },
      { $set: doc },
      { upsert: true }
    );
    return;
  }
  await col.insertOne(doc);
}

export async function notifyMany(db: Db, userIds: string[], base: Omit<NotifyPayload, 'userId'>): Promise<void> {
  const unique = [...new Set(userIds.map((s) => String(s)).filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.all(unique.map((uid) => notifyOne(db, { ...base, userId: uid })));
}

