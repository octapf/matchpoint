/**
 * Single-elimination bracket planning for category phase.
 * Shared by server (persisted matches) and client (display overlay for legacy rows).
 * Plans are in array order so every feeder index is less than the consumer index.
 */

export type CategoryKnockoutMatchPlan = {
  bracketRound: number;
  orderIndex: number;
  teamAId?: string;
  teamBId?: string;
  advanceTeamAFromPlanIndex?: number;
  advanceTeamBFromPlanIndex?: number;
  advanceTeamALoserFromPlanIndex?: number;
  advanceTeamBLoserFromPlanIndex?: number;
  isBronze?: boolean;
};

type Slot = { kind: 'team'; teamId: string } | { kind: 'bye' } | { kind: 'winner'; planIndex: number };

function slotWinnerIndex(s: Slot): number | null {
  return s.kind === 'winner' ? s.planIndex : null;
}

/** Standard single-elimination leaf ordering for K=2^n teams (index = seed-1, 0 = top seed). */
export function seedOrderForBracketSize(k: number): number[] {
  if (k <= 1) return [0];
  if (k === 2) return [0, 1];
  const half = k / 2;
  const prev = seedOrderForBracketSize(half);
  const out: number[] = [];
  for (const p of prev) {
    out.push(p);
    out.push(k - 1 - p);
  }
  return out;
}

function slotTeamId(s: Slot): string | null {
  if (s.kind === 'team') return s.teamId || null;
  return null;
}

function planCategorySingleEliminationCore(teamIdsBestFirst: string[]): CategoryKnockoutMatchPlan[] {
  const teams = teamIdsBestFirst.map(String).filter(Boolean);
  if (teams.length < 2) return [];

  const k = 2 ** Math.ceil(Math.log2(teams.length));
  const padded = [...teams];
  while (padded.length < k) padded.push('');

  const perm = seedOrderForBracketSize(k);
  const leaves: Slot[] = perm.map((pi) => {
    const tid = padded[pi] ?? '';
    return tid ? { kind: 'team' as const, teamId: tid } : { kind: 'bye' as const };
  });

  const plans: CategoryKnockoutMatchPlan[] = [];
  let round = 1;
  let slots = leaves;

  while (slots.length > 1) {
    const next: Slot[] = [];
    let orderInRound = 0;
    for (let i = 0; i < slots.length; i += 2) {
      const L = slots[i]!;
      const R = slots[i + 1]!;
      const lt = slotTeamId(L);
      const rt = slotTeamId(R);
      const lw = slotWinnerIndex(L);
      const rw = slotWinnerIndex(R);

      if (lt && rt) {
        const idx = plans.length;
        plans.push({
          bracketRound: round,
          orderIndex: orderInRound++,
          teamAId: lt,
          teamBId: rt,
        });
        next.push({ kind: 'winner', planIndex: idx });
      } else if (lt && rw != null) {
        const idx = plans.length;
        plans.push({
          bracketRound: round,
          orderIndex: orderInRound++,
          teamAId: lt,
          advanceTeamBFromPlanIndex: rw,
        });
        next.push({ kind: 'winner', planIndex: idx });
      } else if (lw != null && rt) {
        const idx = plans.length;
        plans.push({
          bracketRound: round,
          orderIndex: orderInRound++,
          advanceTeamAFromPlanIndex: lw,
          teamBId: rt,
        });
        next.push({ kind: 'winner', planIndex: idx });
      } else if (lw != null && rw != null) {
        const idx = plans.length;
        plans.push({
          bracketRound: round,
          orderIndex: orderInRound++,
          advanceTeamAFromPlanIndex: lw,
          advanceTeamBFromPlanIndex: rw,
        });
        next.push({ kind: 'winner', planIndex: idx });
      } else if (lt && !rt && R.kind === 'bye') {
        next.push({ kind: 'team', teamId: lt });
      } else if (!lt && L.kind === 'bye' && rt) {
        next.push({ kind: 'team', teamId: rt });
      } else if (lw != null && R.kind === 'bye') {
        next.push({ kind: 'winner', planIndex: lw });
      } else if (L.kind === 'bye' && rw != null) {
        next.push({ kind: 'winner', planIndex: rw });
      } else {
        next.push({ kind: 'bye' });
      }
    }
    slots = next;
    round++;
  }

  const maxRound = plans.length ? Math.max(...plans.map((p) => p.bracketRound)) : 0;
  if (k >= 4 && maxRound >= 2) {
    const semiRound = maxRound - 1;
    const semis = plans
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.bracketRound === semiRound && !p.isBronze);
    if (semis.length === 2) {
      const bronzeOrder = plans.filter((p) => !p.isBronze).length;
      plans.push({
        bracketRound: maxRound + 1,
        orderIndex: bronzeOrder,
        isBronze: true,
        advanceTeamALoserFromPlanIndex: semis[0]!.i,
        advanceTeamBLoserFromPlanIndex: semis[1]!.i,
      });
    }
  }

  return plans;
}

export function planCategorySingleElimination(teamIdsBestFirst: string[]): CategoryKnockoutMatchPlan[] {
  return planCategorySingleEliminationCore(teamIdsBestFirst);
}
