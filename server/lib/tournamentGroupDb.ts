import type { Db } from 'mongodb';
import { tournamentIdMongoFilter } from './mongoTournamentIdFilter';

/** Pick the group with the fewest teams (ties → lowest index). Respects equal capacity per group. */
export async function pickLeastLoadedGroup(
  db: Db,
  tournamentId: string,
  vg: { groupCount: number; teamsPerGroup: number }
): Promise<number> {
  let best = 0;
  let bestCount = Infinity;
  for (let i = 0; i < vg.groupCount; i++) {
    const c = await countTeamsInGroup(db, tournamentId, i);
    if (c < bestCount) {
      bestCount = c;
      best = i;
    }
  }
  return best;
}

/** Count teams in a group; missing groupIndex counts as group 0. */
export async function countTeamsInGroup(
  db: Db,
  tournamentId: string,
  groupIndex: number
): Promise<number> {
  const col = db.collection('teams');
  const tid = tournamentIdMongoFilter(tournamentId);
  if (groupIndex === 0) {
    return col.countDocuments({
      ...tid,
      $or: [{ groupIndex: 0 }, { groupIndex: { $exists: false } }, { groupIndex: null }],
    });
  }
  return col.countDocuments({ ...tid, groupIndex });
}
