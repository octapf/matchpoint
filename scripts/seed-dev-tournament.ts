/**
 * CLI: same data as Admin → Dev seed and POST /api/admin (action devSeed).
 * Requires MONGODB_URI in .env
 *
 *   npx tsx scripts/seed-dev-tournament.ts
 *   npx tsx scripts/seed-dev-tournament.ts --force
 *   npx tsx scripts/seed-dev-tournament.ts --purge   # remove dev tournament + all seed users
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { purgeDevSeed, runDevSeed } from '../server/lib/seedDevTournament';

async function main() {
  const uri = process.env.MONGODB_URI || '';
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  const purge = process.argv.includes('--purge');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('matchpoint');
  try {
    if (purge) {
      const result = await purgeDevSeed(db);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const result = await runDevSeed(db, { force });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
