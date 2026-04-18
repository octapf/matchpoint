import type { TournamentBettingSnapshot } from '@/types';

/** Count visible line rows per user (each row is one placed pick). */
function picksPerUserFromMatchLines(snapshot: TournamentBettingSnapshot): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of snapshot.matches ?? []) {
    const lines = row.lines;
    if (!lines?.length) continue;
    for (const line of lines) {
      const uid = String(line.userId ?? '').trim();
      if (!uid) continue;
      m.set(uid, (m.get(uid) ?? 0) + 1);
    }
  }
  return m;
}

/**
 * Ensures leaderboard `picksCount` reflects visible match lines when the API omits or
 * under-reports counts (e.g. older deploys). Merges users who appear only in lines.
 */
export function augmentBettingSnapshotWithLinePicks(
  snapshot: TournamentBettingSnapshot | null
): TournamentBettingSnapshot | null {
  if (!snapshot) return null;
  const fromLines = picksPerUserFromMatchLines(snapshot);
  if (fromLines.size === 0) return snapshot;

  const byUser = new Map<string, { userId: string; points: number; exactHits: number; picksCount: number }>();
  for (const row of snapshot.leaderboard ?? []) {
    byUser.set(row.userId, {
      userId: row.userId,
      points: row.points,
      exactHits: row.exactHits,
      picksCount: row.picksCount ?? 0,
    });
  }

  for (const [userId, lineCount] of fromLines) {
    const existing = byUser.get(userId);
    if (existing) {
      existing.picksCount = Math.max(existing.picksCount, lineCount);
    } else {
      byUser.set(userId, {
        userId,
        points: 0,
        exactHits: 0,
        picksCount: lineCount,
      });
    }
  }

  const leaderboard = [...byUser.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
    if (b.picksCount !== a.picksCount) return b.picksCount - a.picksCount;
    return a.userId.localeCompare(b.userId);
  });

  return { ...snapshot, leaderboard };
}
