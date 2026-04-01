import type { Db } from 'mongodb';

export async function ensureDbIndexes(db: Db) {
  const entries = db.collection('entries');
  const waitlist = db.collection('waitlist');
  const teams = db.collection('teams');
  const matches = db.collection('matches');
  const notifications = db.collection('notifications');

  const created: string[] = [];

  // Integrity: one entry per user per tournament, one waitlist per user per tournament.
  // Drop legacy waitlist unique index (pre-division waitlist). Best-effort.
  try {
    await waitlist.dropIndex('waitlist_tournament_user_unique');
  } catch {
    // ignore
  }
  created.push(
    (await entries.createIndex({ tournamentId: 1, userId: 1 }, { unique: true, name: 'entries_tournament_user_unique' })) as unknown as string
  );
  created.push(
    (await waitlist.createIndex(
      { tournamentId: 1, division: 1, userId: 1 },
      { unique: true, name: 'waitlist_tournament_div_user_unique' }
    )) as unknown as string
  );
  created.push(
    (await waitlist.createIndex({ tournamentId: 1, division: 1, createdAt: 1 }, { name: 'waitlist_tournament_div_createdAt' })) as unknown as string
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

  // Notifications (in-app inbox)
  created.push(
    (await notifications.createIndex({ userId: 1, createdAt: -1 }, { name: 'notifications_user_createdAt' })) as unknown as string
  );
  // TTL auto-delete (default: 30 days)
  created.push(
    (await notifications.createIndex(
      { createdAt: 1 },
      { name: 'notifications_ttl_30d', expireAfterSeconds: 60 * 60 * 24 * 30 }
    )) as unknown as string
  );
  // Dedupe
  created.push(
    (await notifications.createIndex({ userId: 1, dedupeKey: 1 }, { name: 'notifications_user_dedupe' })) as unknown as string
  );

  return { ok: true as const, created };
}

