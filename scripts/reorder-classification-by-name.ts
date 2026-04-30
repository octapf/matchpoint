/**
 * Reorder classification matches for an existing tournament by name (exact match, case-insensitive).
 *
 * Usage:
 *   npx tsx scripts/reorder-classification-by-name.ts "MINI KIWI"
 *
 * Requires MONGODB_URI in .env.
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import dns from 'node:dns';

function asString(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

/** Escape user input for use inside a RegExp (exact name match). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Pair = [string, string];

async function expandMongoSrvUri(uri: string): Promise<string> {
  if (!uri.startsWith('mongodb+srv://')) return uri;

  // Node's default DNS resolver can fail on some routers (ECONNREFUSED on SRV lookups).
  // Use a dedicated resolver against public DNS to make this script reliable.
  const resolver = new dns.promises.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);

  const url = new URL(uri);
  const hostname = url.hostname; // e.g. cluster0.xxxxx.mongodb.net
  const username = decodeURIComponent(url.username || '');
  const password = decodeURIComponent(url.password || '');
  const auth =
    username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
  const dbName = (url.pathname || '/').replace(/^\//, '') || '';

  const srvName = `_mongodb._tcp.${hostname}`;
  const srv = await resolver.resolveSrv(srvName);
  const hosts = srv
    .map((r) => `${r.name}:${r.port}`)
    .sort()
    .join(',');
  if (!hosts) throw new Error(`No SRV records for ${srvName}`);

  // Atlas encodes options in a TXT record on the host, plus anything already in the URI querystring.
  let txtOpts = '';
  try {
    const txt = await resolver.resolveTxt(hostname);
    const merged = txt.map((parts) => parts.join('')).join('&');
    txtOpts = merged;
  } catch {
    // ignore; some clusters may not have TXT or DNS blocks it
  }

  const queryParts = [txtOpts, url.searchParams.toString()].filter(Boolean);
  const query = queryParts.length ? `?${queryParts.join('&')}` : '';
  return `mongodb://${auth}${hosts}/${dbName}${query}`;
}

function orderPairsForRest(pairs: Pair[]): Pair[] {
  const remaining = pairs.map((p) => ({ a: p[0], b: p[1] }));
  const out: Pair[] = [];
  let prevTeams = new Set<string>();
  const streak = new Map<string, number>();

  const scoreCandidate = (a: string, b: string): number => {
    let s = 0;
    if (prevTeams.has(a)) s += 10_000;
    if (prevTeams.has(b)) s += 10_000;
    for (const t of [a, b]) {
      const st = streak.get(t) ?? 0;
      if (st >= 2) s += 5_000 + (st - 2) * 1_000;
      else if (st === 1) s += 400;
      s += st;
    }
    return s;
  };

  while (remaining.length > 0) {
    let bestI = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!;
      const sc = scoreCandidate(c.a, c.b);
      if (sc < bestScore) {
        bestScore = sc;
        bestI = i;
      }
    }
    const chosen = remaining.splice(bestI, 1)[0]!;
    out.push([chosen.a, chosen.b]);

    const nextTeams = new Set<string>([chosen.a, chosen.b]);
    for (const t of Array.from(streak.keys())) {
      if (!nextTeams.has(t)) streak.set(t, 0);
    }
    for (const t of nextTeams) {
      const prev = streak.get(t) ?? 0;
      streak.set(t, prevTeams.has(t) ? prev + 1 : 1);
    }
    prevTeams = nextTeams;
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function main() {
  const name = process.argv.slice(2).join(' ').trim();
  if (!name) {
    console.error('Missing tournament name. Example: npx tsx scripts/reorder-classification-by-name.ts "MINI KIWI"');
    process.exit(1);
  }

  const rawUri = process.env.MONGODB_URI || '';
  const uri = rawUri ? await expandMongoSrvUri(rawUri) : '';
  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('matchpoint');
  try {
    const tournamentsCol = db.collection('tournaments');
    const rx = new RegExp(`^${escapeRegex(name)}$`, 'i');
    const matches = await tournamentsCol
      .find({ name: rx })
      .project({ _id: 1, name: 1, phase: 1, createdAt: 1 })
      .toArray();

    if (matches.length === 0) {
      console.log(JSON.stringify({ ok: false, error: 'Tournament not found', name }, null, 2));
      process.exit(2);
    }
    if (matches.length > 1) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: 'Multiple tournaments match this name; refusing to reorder',
            name,
            matches: matches.map((m) => ({ _id: String(m._id), name: asString((m as any).name), phase: asString((m as any).phase) })),
          },
          null,
          2
        )
      );
      process.exit(3);
    }

    const t = matches[0]!;
    const tournamentId = String(t._id);
    if (!ObjectId.isValid(tournamentId)) {
      console.log(JSON.stringify({ ok: false, error: 'Invalid tournament id', tournamentId, name }, null, 2));
      process.exit(4);
    }

    const matchesCol = db.collection('matches');
    const all = await matchesCol
      .find({ tournamentId, stage: 'classification' })
      .project({ _id: 1, division: 1, groupIndex: 1, teamAId: 1, teamBId: 1, status: 1, orderIndex: 1, createdAt: 1 })
      .toArray();

    const scheduled = all.filter((m: any) => String(m.status ?? '') === 'scheduled');
    const byBucket = new Map<string, any[]>();
    for (const m of scheduled as any[]) {
      const div = String(m.division ?? '');
      const gi = Number(m.groupIndex ?? -1);
      const key = `${div}|${Number.isFinite(gi) ? gi : -1}`;
      const list = byBucket.get(key) ?? [];
      list.push(m);
      byBucket.set(key, list);
    }

    const ops: any[] = [];
    let updated = 0;
    for (const [bucket, bucketMatches] of byBucket.entries()) {
      const [div, giStr] = bucket.split('|');
      const gi = Number(giStr);
      const original = bucketMatches
        .slice()
        .sort((x, y) => Number(x.orderIndex ?? 0) - Number(y.orderIndex ?? 0) || String(x.createdAt ?? '').localeCompare(String(y.createdAt ?? '')));
      const pairs: Pair[] = original.map((m) => [String((m as any).teamAId ?? ''), String((m as any).teamBId ?? '')]);
      const orderedPairs = orderPairsForRest(pairs);

      // Map pair→queue of match docs to handle duplicates (matchesPerOpponent > 1).
      const q = new Map<string, any[]>();
      for (const m of original) {
        const a = String((m as any).teamAId ?? '');
        const b = String((m as any).teamBId ?? '');
        const k = pairKey(a, b);
        const list = q.get(k) ?? [];
        list.push(m);
        q.set(k, list);
      }

      for (let i = 0; i < orderedPairs.length; i++) {
        const [a, b] = orderedPairs[i]!;
        const k = pairKey(a, b);
        const list = q.get(k) ?? [];
        const doc = list.shift();
        if (!doc) continue;
        q.set(k, list);

        const nextOrderIndex = i;
        if (Number(doc.orderIndex ?? -1) !== nextOrderIndex) {
          ops.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { orderIndex: nextOrderIndex } },
            },
          });
          updated++;
        }
      }
    }

    if (ops.length > 0) {
      await matchesCol.bulkWrite(ops, { ordered: false });
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tournamentId,
          tournamentName: asString((t as any).name),
          phase: asString((t as any).phase),
          classificationMatches: all.length,
          scheduledMatchesReordered: scheduled.length,
          orderIndexUpdated: updated,
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

