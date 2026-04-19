import { ObjectId } from 'mongodb';

/** String form for comparing tournament ids from DB (ObjectId or string). */
export function normalizeDbTournamentId(raw: unknown): string {
  if (raw instanceof ObjectId) return raw.toString();
  return String(raw ?? '');
}

/** Query fragment when `tournamentId` may be stored as string or ObjectId in Mongo. */
export function tournamentIdMongoFilter(tournamentId: string): Record<string, unknown> {
  if (!ObjectId.isValid(tournamentId)) return { tournamentId };
  const oid = new ObjectId(tournamentId);
  return { tournamentId: { $in: [tournamentId, oid] } };
}
