/**
 * Delete tournament(s) by name (exact match, case-insensitive).
 *
 * Usage — one or more names (each argv is one full name):
 *   npx tsx scripts/delete-tournament-by-name.ts "mini kiwi" "kiwi2.5"
 *
 * Requires MONGODB_URI in .env.
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { purgeTournamentRelatedData } from '../server/lib/tournamentDeleteCascade';

function asString(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

/** Escape user input for use inside a RegExp (exact name match). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const names = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) {
    console.error('Missing tournament name argument(s). Example: npx tsx scripts/delete-tournament-by-name.ts "mini kiwi" "kiwi2.5"');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || '';
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('matchpoint');
  try {
    const tournamentsCol = db.collection('tournaments');

    for (const name of names) {
      const rx = new RegExp(`^${escapeRegex(name)}$`, 'i');
      const matches = await tournamentsCol
        .find({ name: rx })
        .project({ _id: 1, name: 1, startedAt: 1, phase: 1, createdAt: 1 })
        .toArray();

      if (matches.length === 0) {
        console.log(JSON.stringify({ ok: false, error: 'Tournament not found', name }, null, 2));
        continue;
      }
      if (matches.length > 1) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              error: 'Multiple tournaments match this name; refusing to delete',
              name,
              matches: matches.map((m) => ({
                _id: String(m._id),
                name: asString((m as any).name),
                phase: asString((m as any).phase),
                startedAt: (m as any).startedAt ?? null,
                createdAt: (m as any).createdAt ?? null,
              })),
            },
            null,
            2
          )
        );
        continue;
      }

      const t = matches[0]!;
      const id = String(t._id);
      const storedName = asString((t as any).name);
      if (!ObjectId.isValid(id)) {
        console.log(JSON.stringify({ ok: false, error: 'Invalid tournament id', id, name }, null, 2));
        continue;
      }

      await purgeTournamentRelatedData(db, id);
      await tournamentsCol.deleteOne({ _id: new ObjectId(id) });
      console.log(JSON.stringify({ ok: true, deletedTournamentId: id, name: storedName }, null, 2));
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
