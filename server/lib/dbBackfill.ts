import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { TournamentDivision } from '../../types';
import { deriveTournamentGroupConfig } from './tournamentConfig';
import { ensureDbIndexes } from './dbIndexes';

function asStringTournamentId(tournamentId: unknown): string | null {
  if (typeof tournamentId === 'string' && tournamentId.trim()) return tournamentId.trim();
  if (tournamentId instanceof ObjectId) return tournamentId.toString();
  return null;
}

export async function backfillTournamentIdStrings(db: Db): Promise<{
  matches: number;
  teams: number;
  entries: number;
  waitlist: number;
}> {
  const cols = [
    { name: 'matches', col: db.collection('matches') },
    { name: 'teams', col: db.collection('teams') },
    { name: 'entries', col: db.collection('entries') },
    { name: 'waitlist', col: db.collection('waitlist') },
  ] as const;

  const out: Record<string, number> = { matches: 0, teams: 0, entries: 0, waitlist: 0 };
  for (const { name, col } of cols) {
    // Update docs that store tournamentId as ObjectId.
    const docs = await col.find({ tournamentId: { $type: 'objectId' } }).project({ _id: 1, tournamentId: 1 }).toArray();
    if (!docs.length) continue;
    const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
    for (const d of docs as unknown as Array<{ _id: ObjectId; tournamentId: ObjectId }>) {
      ops.push({
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { tournamentId: d.tournamentId.toString() } },
        },
      });
    }
    if (ops.length) {
      const r = await col.bulkWrite(ops, { ordered: false });
      out[name] += r.modifiedCount ?? 0;
    }
  }
  return out as { matches: number; teams: number; entries: number; waitlist: number };
}

export async function backfillClassificationDivision(db: Db, tournamentId: string): Promise<{ updated: number }> {
  const tournamentsCol = db.collection('tournaments');
  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });
  const divisions = cfg.divisions.length ? cfg.divisions : (['mixed'] as TournamentDivision[]);

  const matchesCol = db.collection('matches');
  const docs = await matchesCol
    .find({ tournamentId, stage: 'classification', $or: [{ division: { $exists: false } }, { division: null }] })
    .project({ _id: 1, groupIndex: 1 })
    .toArray();
  if (!docs.length) return { updated: 0 };

  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  for (const d of docs as unknown as Array<{ _id: ObjectId; groupIndex?: unknown }>) {
    const gi = Number(d.groupIndex ?? 0);
    const di = cfg.divisionIndexForGroupIndex(Number.isFinite(gi) ? gi : 0);
    const div = divisions[di] ?? divisions[0];
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { division: div } } } });
  }
  const r = await matchesCol.bulkWrite(ops, { ordered: false });
  return { updated: r.modifiedCount ?? 0 };
}

export async function backfillTeamDivisionFromGroup(db: Db, tournamentId: string): Promise<{ updated: number }> {
  const tournamentsCol = db.collection('tournaments');
  const t = await tournamentsCol.findOne({ _id: new ObjectId(tournamentId) });
  if (!t) throw new Error('Tournament not found');
  const cfg = deriveTournamentGroupConfig(t as { maxTeams?: unknown; groupCount?: unknown; divisions?: unknown });
  const divisions = cfg.divisions.length ? cfg.divisions : (['mixed'] as TournamentDivision[]);

  const teamsCol = db.collection('teams');
  const docs = await teamsCol
    .find({ tournamentId, $or: [{ division: { $exists: false } }, { division: null }] })
    .project({ _id: 1, groupIndex: 1 })
    .toArray();
  if (!docs.length) return { updated: 0 };

  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  for (const d of docs as unknown as Array<{ _id: ObjectId; groupIndex?: unknown }>) {
    const gi = Number(d.groupIndex ?? 0);
    const di = cfg.divisionIndexForGroupIndex(Number.isFinite(gi) ? gi : 0);
    const div = divisions[di] ?? divisions[0];
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { division: div } } } });
  }
  const r = await teamsCol.bulkWrite(ops, { ordered: false });
  return { updated: r.modifiedCount ?? 0 };
}

export async function backfillTournamentDates(db: Db, tournamentId?: string | null): Promise<{ updated: number }> {
  const tournamentsCol = db.collection('tournaments');
  const filter: Record<string, unknown> = {
    date: { $exists: true, $ne: null },
    $or: [{ startDate: { $exists: false } }, { startDate: null }, { endDate: { $exists: false } }, { endDate: null }],
  };
  if (tournamentId && ObjectId.isValid(tournamentId)) {
    filter._id = new ObjectId(tournamentId);
  }

  const docs = await tournamentsCol.find(filter).project({ _id: 1, date: 1, startDate: 1, endDate: 1 }).toArray();
  if (!docs.length) return { updated: 0 };

  const ops: { updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }[] = [];
  for (const d of docs as unknown as Array<{ _id: ObjectId; date?: unknown; startDate?: unknown; endDate?: unknown }>) {
    const raw = d.date;
    const iso = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    if (!iso) continue;
    const next: Record<string, unknown> = {};
    if (d.startDate == null) next.startDate = iso;
    if (d.endDate == null) next.endDate = iso;
    if (Object.keys(next).length === 0) continue;
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: next, $unset: { date: '' } } } });
  }
  if (!ops.length) return { updated: 0 };
  const r = await tournamentsCol.bulkWrite(ops, { ordered: false });
  return { updated: r.modifiedCount ?? 0 };
}

export async function runDbBackfill(db: Db, params?: { tournamentId?: string | null }): Promise<Record<string, unknown>> {
  const tournamentId = params?.tournamentId?.trim() || null;
  const indexes = await ensureDbIndexes(db);
  const tournamentBackfills =
    tournamentId && ObjectId.isValid(tournamentId)
      ? {
          tournamentId,
          ...(await backfillClassificationDivision(db, tournamentId)),
          ...(await backfillTeamDivisionFromGroup(db, tournamentId)),
        }
      : null;

  const tid = await backfillTournamentIdStrings(db);
  const dates = await backfillTournamentDates(db, tournamentId);
  return {
    indexes,
    tournamentIdStrings: tid,
    tournamentDates: dates,
    tournament: tournamentBackfills,
  };
}

