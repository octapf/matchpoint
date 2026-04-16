import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { signSessionToken } from './sessionToken';
import { maybePromoteAdminOnLogin } from './adminBootstrap';

export function serializeUserPublic(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, passwordHash, ...rest } = doc;
  return { ...rest, _id: _id instanceof ObjectId ? _id.toString() : _id };
}

/** Promote admin by email if configured, reload user, return public user + JWT. */
export async function issueSessionAndUser(
  db: Db,
  userId: string,
  email: string | undefined
): Promise<{ user: Record<string, unknown>; accessToken: string }> {
  await maybePromoteAdminOnLogin(db, email, userId);
  const usersCol = db.collection('users');
  let user = await usersCol.findOne({ _id: new ObjectId(userId) });
  // If the account was soft-deleted, reactivate on successful session issuance.
  if ((user as { deletedAt?: unknown }).deletedAt) {
    const now = new Date().toISOString();
    await usersCol.updateOne(
      { _id: new ObjectId(userId) },
      { $unset: { deletedAt: '', deletedBy: '' }, $set: { updatedAt: now } }
    );
    user = await usersCol.findOne({ _id: new ObjectId(userId) });
  }
  // Ensure we never return a session user without binary gender.
  // Default to 'male' so user can correct it later in Profile → My data.
  const g = typeof (user as any)?.gender === 'string' ? String((user as any).gender) : '';
  if (g !== 'male' && g !== 'female') {
    await usersCol.updateOne({ _id: new ObjectId(userId) }, { $set: { gender: 'male' } });
    user = await usersCol.findOne({ _id: new ObjectId(userId) });
  }
  const serialized = serializeUserPublic(user as Record<string, unknown>);
  if (!serialized) throw new Error('User missing');
  return { user: serialized, accessToken: signSessionToken(userId) };
}
