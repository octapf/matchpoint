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
      db.collection('entries').createIndex({ userId: 1 }, { name: 'entries_user' }),
      db.collection('waitlist').createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'waitlist_tournament_user_unique' }),
      db.collection('waitlist').createIndex({ userId: 1 }, { name: 'waitlist_user' }),
      db.collection('tournaments').createIndex({ inviteLink: 1 }, { name: 'tournaments_invite' }),
      db.collection('teams').createIndex({ tournamentId: 1, groupIndex: 1 }, { name: 'teams_tournament_group' }),
      db.collection('teams').createIndex({ tournamentId: 1, division: 1, category: 1 }, { name: 'teams_tournament_division_category' }),
      db.collection('matches').createIndex(
        { tournamentId: 1, stage: 1, division: 1, category: 1, groupIndex: 1, status: 1 },
        { name: 'matches_tournament_filters' }
      ),
      db.collection('matches').createIndex({ tournamentId: 1, createdAt: 1 }, { name: 'matches_tournament_createdAt' }),
      db.collection('matches').createIndex(
        { tournamentId: 1, refereeUserId: 1, status: 1 },
        { name: 'matches_tournament_refUser_status' }
      ),
      db.collection('matches').createIndex(
        { tournamentId: 1, status: 1, refereeTeamId: 1 },
        { name: 'matches_tournament_status_refTeam' }
      ),
      db.collection('admin_audit_logs').createIndex({ createdAt: -1 }, { name: 'admin_audit_createdAt' }),
      db.collection('admin_audit_logs').createIndex({ actorId: 1, createdAt: -1 }, { name: 'admin_audit_actor_created' }),
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

