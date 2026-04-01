/**
 * Backfill legacy waitlist documents missing `division`.
 *
 * Safe to run multiple times.
 *
 * Requires MONGODB_URI in env.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('matchpoint');

  try {
    const waitlist = db.collection('waitlist');
    const filter = {
      $or: [{ division: { $exists: false } }, { division: null }, { division: '' }],
    };
    const now = new Date().toISOString();
    const r = await waitlist.updateMany(filter, { $set: { division: 'mixed', updatedAt: now } });
    console.log(`OK: waitlist division backfill updated ${r.modifiedCount ?? 0} docs`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

