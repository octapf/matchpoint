import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

export async function loadMatchTeamPlayers(
  db: Db,
  tournamentId: string,
  teamAId: string,
  teamBId: string
): Promise<{ playersA: string[]; playersB: string[] }> {
  const [teamA, teamB] = await db
    .collection('teams')
    .find({ tournamentId, _id: { $in: [new ObjectId(teamAId), new ObjectId(teamBId)] } })
    .project({ _id: 1, playerIds: 1 })
    .toArray()
    .then((rows) => {
      const map = new Map<string, (typeof rows)[0]>();
      for (const r of rows as { _id?: unknown; playerIds?: unknown }[]) map.set(String(r._id), r);
      return [map.get(teamAId), map.get(teamBId)];
    });

  const playersA: string[] = Array.isArray(teamA?.playerIds) ? teamA.playerIds.map(String).filter(Boolean) : [];
  const playersB: string[] = Array.isArray(teamB?.playerIds) ? teamB.playerIds.map(String).filter(Boolean) : [];
  return { playersA, playersB };
}
export type ServeSide = 'A' | 'B';

export type ServeOrderValidation =
  | { ok: true; order: string[]; startsSide: ServeSide }
  | { ok: false; error: string };

function cleanPlayerIds(ids: unknown[]): string[] {
  return ids.map((pid) => String(pid ?? '').trim()).filter(Boolean);
}

function expectedSlots(players: string[]): string[] {
  if (players.length === 0) return [];
  return [players[0]!, players[1] ?? players[0]!];
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const item of a) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of b) {
    const next = (counts.get(item) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(item);
    else counts.set(item, next);
  }
  return counts.size === 0;
}

export function buildDefaultServeOrder(playersAInput: unknown[], playersBInput: unknown[]): string[] {
  const playersA = cleanPlayerIds(playersAInput);
  const playersB = cleanPlayerIds(playersBInput);
  if (playersA.length === 0 || playersB.length === 0) return [];
  const aSlots = expectedSlots(playersA);
  const bSlots = expectedSlots(playersB);
  return [aSlots[0]!, bSlots[0]!, aSlots[1]!, bSlots[1]!];
}

export function validateServeOrderForTeams(
  orderInput: unknown[],
  playersAInput: unknown[],
  playersBInput: unknown[]
): ServeOrderValidation {
  const order = cleanPlayerIds(orderInput);
  if (order.length !== 4) return { ok: false, error: 'Invalid serve order' };

  const playersA = cleanPlayerIds(playersAInput);
  const playersB = cleanPlayerIds(playersBInput);
  if (playersA.length === 0 || playersB.length === 0) {
    return { ok: false, error: 'Teams missing players' };
  }

  const expectedA = expectedSlots(playersA);
  const expectedB = expectedSlots(playersB);
  const oddSlots = [order[0]!, order[2]!];
  const evenSlots = [order[1]!, order[3]!];

  if (sameMultiset(oddSlots, expectedA) && sameMultiset(evenSlots, expectedB)) {
    return { ok: true, order, startsSide: 'A' };
  }
  if (sameMultiset(oddSlots, expectedB) && sameMultiset(evenSlots, expectedA)) {
    return { ok: true, order, startsSide: 'B' };
  }
  return { ok: false, error: 'Serve order contains invalid players' };
}

export function serveSideAtIndex(order: string[], playersAInput: unknown[], playersBInput: unknown[], index: number): ServeSide | null {
  const validation = validateServeOrderForTeams(order, playersAInput, playersBInput);
  if (!validation.ok) return null;
  const normalizedIndex = Number.isFinite(index) ? Math.floor(index) % 4 : 0;
  if (normalizedIndex < 0) return null;
  return validation.startsSide === 'A'
    ? normalizedIndex % 2 === 0
      ? 'A'
      : 'B'
    : normalizedIndex % 2 === 0
      ? 'B'
      : 'A';
}
