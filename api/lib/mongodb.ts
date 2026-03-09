/**
 * MongoDB connection for Vercel serverless
 * Reuses connection across invocations (serverless-friendly)
 */

import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || '';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  if (global._mongoClientPromise) {
    return global._mongoClientPromise;
  }
  global._mongoClientPromise = new MongoClient(uri).connect();
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db('matchpoint');
}

/** Convert MongoDB doc _id to string for JSON response */
export function serializeDoc<T extends { _id?: unknown }>(doc: T | null): Omit<T, '_id'> & { _id: string } | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, _id: String(_id) } as Omit<T, '_id'> & { _id: string };
}

export function serializeDocs<T extends { _id?: unknown }>(docs: T[]): (Omit<T, '_id'> & { _id: string })[] {
  return docs.map((d) => serializeDoc(d)!);
}
