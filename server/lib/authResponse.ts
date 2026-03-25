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
  const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
  const serialized = serializeUserPublic(user as Record<string, unknown>);
  if (!serialized) throw new Error('User missing');
  return { user: serialized, accessToken: signSessionToken(userId) };
}
