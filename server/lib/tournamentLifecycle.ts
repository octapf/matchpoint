import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { generateClassificationMatches, randomizeTeamGroups } from './classificationMatches';
import { generateCategoryMatches } from './categoryMatches';

function tournamentStarted(doc: Record<string, unknown>) {
  const startedAt = (doc as { startedAt?: unknown }).startedAt;
  const phase = String((doc as { phase?: unknown }).phase ?? '');
  return !!startedAt || phase === 'classification' || phase === 'categories' || phase === 'completed';
}

export async function actionRandomizeGroups(db: Db, tournamentId: string) {
  return randomizeTeamGroups(db, tournamentId);
}

export async function actionStartTournament(
  db: Db,
  tournamentId: string,
  params: { matchesPerOpponent?: unknown }
): Promise<{ startedAt: string; matches: { created: number; total: number } }> {
  const tournaments = db.collection('tournaments');
  const oid = new ObjectId(tournamentId);
  const current = await tournaments.findOne({ _id: oid });
  if (!current) throw new Error('Tournament not found');
  const cur = current as Record<string, unknown>;
  if (tournamentStarted(cur)) throw new Error('Tournament already started');

  const matchesPerOpponentRaw = Number(
    params.matchesPerOpponent ?? (cur as { classificationMatchesPerOpponent?: unknown }).classificationMatchesPerOpponent ?? 1
  );
  const matchesPerOpponent = Math.max(1, Math.min(5, Math.floor(matchesPerOpponentRaw) || 1));
  const pointsToWin = Math.max(1, Math.min(99, Number((cur as { pointsToWin?: unknown }).pointsToWin ?? 21) || 21));
  const setsPerMatch = Math.max(1, Math.min(7, Number((cur as { setsPerMatch?: unknown }).setsPerMatch ?? 1) || 1));

  const now = new Date().toISOString();

  // Phase transition is atomic: only one caller can flip it.
  const transitioned = await tournaments.findOneAndUpdate(
    {
      _id: oid,
      $and: [
        { phase: { $in: [null, 'registration'] } },
        { $or: [{ startedAt: null }, { startedAt: { $exists: false } }] },
      ],
    },
    {
      $set: {
        phase: 'classification',
        startedAt: now,
        classificationMatchesPerOpponent: matchesPerOpponent,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' }
  );
  if (!transitioned) throw new Error('Tournament already started');

  // Clear previous classification matches only after successful transition.
  await db.collection('matches').deleteMany({ tournamentId: tournamentId, stage: 'classification' });

  const gen = await generateClassificationMatches(db, tournamentId, {
    matchesPerOpponent,
    pointsToWin,
    setsPerMatch,
  });

  return { startedAt: now, matches: gen };
}

export async function actionPublishCategoryMatches(db: Db, tournamentId: string) {
  // generateCategoryMatches already validates phase and completion; keep wrapper for consistency.
  return generateCategoryMatches(db, tournamentId);
}

