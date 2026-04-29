import type { Team } from '@/types';
import type { BracketMatchRow } from '@/components/tournament/detail/CategoryBracketDiagram';
import { isMongoObjectId } from '@/lib/tournamentMatchDisplay';

function effectiveParticipantId(team: Team): string | null {
  const id = String(team?._id ?? '').trim();
  if (!isMongoObjectId(id)) return null;
  return id.toLowerCase();
}

/**
 * True if the team lost a completed category-bracket match and has no later match in the plan
 * (single elimination + optional bronze). Still competing if they have any unfinished match or a future slot.
 */
export function isTeamEliminatedFromCategoryBracketRows(teamId: string, rows: BracketMatchRow[]): boolean {
  const tid = String(teamId ?? '').trim().toLowerCase();
  if (!tid) return false;

  const sorted = [...rows].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  for (const row of sorted) {
    const a = effectiveParticipantId(row.teamA);
    const b = effectiveParticipantId(row.teamB);
    if (!a || !b) continue;

    if (a !== tid && b !== tid) continue;

    if (row.status !== 'completed') return false;

    const w = String(row.winnerId ?? '').trim().toLowerCase();
    if (w === tid) continue;

    const idx = row.orderIndex ?? 0;
    for (const r2 of sorted) {
      if ((r2.orderIndex ?? 0) <= idx) continue;
      const a2 = effectiveParticipantId(r2.teamA);
      const b2 = effectiveParticipantId(r2.teamB);
      if (a2 === tid || b2 === tid) return false;
    }

    return true;
  }

  return false;
}
