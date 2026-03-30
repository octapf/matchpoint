/**
 * Create MongoDB indexes used by the app.
 * Safe to run multiple times.
 *
 * Requires MONGODB_URI in .env
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
    await Promise.all([
      db.collection('entries').createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'entries_tournament_user_unique' }),
      db.collection('waitlist').createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'waitlist_tournament_user_unique' }),
      db.collection('teams').createIndex({ tournamentId: 1, groupIndex: 1 }, { name: 'teams_tournament_group' }),
      db.collection('teams').createIndex({ tournamentId: 1, division: 1, category: 1 }, { name: 'teams_tournament_division_category' }),
      db.collection('matches').createIndex(
        { tournamentId: 1, stage: 1, division: 1, category: 1, groupIndex: 1, status: 1 },
        { name: 'matches_tournament_filters' }
      ),
      db.collection('matches').createIndex({ tournamentId: 1, createdAt: 1 }, { name: 'matches_tournament_createdAt' }),
    ]);

    console.log('OK: indexes created/verified');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

