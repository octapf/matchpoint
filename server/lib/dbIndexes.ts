import type { Db } from 'mongodb';

export async function ensureDbIndexes(db: Db) {
  const entries = db.collection('entries');
  const waitlist = db.collection('waitlist');
  const teams = db.collection('teams');
  const matches = db.collection('matches');

  const created: string[] = [];

  // Integrity: one entry per user per tournament, one waitlist per user per tournament.
  created.push(
    (await entries.createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'entries_tournament_user_unique' })) as unknown as string
  );
  created.push(
    (await waitlist.createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'waitlist_tournament_user_unique' })) as unknown as string
  );

  // Common access patterns.
  created.push((await teams.createIndex({ tournamentId: 1, groupIndex: 1 }, { name: 'teams_tournament_group' })) as unknown as string);
  created.push((await teams.createIndex({ tournamentId: 1, division: 1, category: 1 }, { name: 'teams_tournament_div_cat' })) as unknown as string);
  created.push((await matches.createIndex({ tournamentId: 1, stage: 1 }, { name: 'matches_tournament_stage' })) as unknown as string);
  created.push((await matches.createIndex({ tournamentId: 1, status: 1 }, { name: 'matches_tournament_status' })) as unknown as string);
  created.push(
    (await matches.createIndex({ tournamentId: 1, status: 1, refereeTeamId: 1 }, { name: 'matches_tournament_status_refTeam' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, status: 1 }, { name: 'matches_tournament_stage_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, division: 1, status: 1 }, { name: 'matches_tournament_div_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, status: 1 }, { name: 'matches_tournament_stage_div_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, groupIndex: 1, status: 1 }, { name: 'matches_classification_lookup_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, category: 1, status: 1 }, { name: 'matches_category_lookup_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, refereeUserId: 1, status: 1 }, { name: 'matches_tournament_refUser_status' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, orderIndex: 1 }, { name: 'matches_slice_order' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, groupIndex: 1 }, { name: 'matches_classification_lookup' })) as unknown as string
  );
  created.push(
    (await matches.createIndex({ tournamentId: 1, stage: 1, division: 1, category: 1 }, { name: 'matches_category_lookup' })) as unknown as string
  );

  const audit = db.collection('admin_audit_logs');
  created.push(
    (await audit.createIndex({ createdAt: -1 }, { name: 'admin_audit_createdAt' })) as unknown as string
  );
  created.push(
    (await audit.createIndex({ actorId: 1, createdAt: -1 }, { name: 'admin_audit_actor_created' })) as unknown as string
  );

  return { ok: true as const, created };
}

