import handler from '../api/tournaments/[id]';

type Res = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
};

function makeRes(): { res: any; out: Res } {
  const out: Res = { statusCode: 200, headers: {}, body: null };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    setHeader(k: string, v: string) {
      out.headers[String(k).toLowerCase()] = String(v);
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    send(payload: unknown) {
      out.body = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res, out };
}

async function run() {
  // Invalid ID should fail fast (no DB hit) and must not 500.
  const { res, out } = makeRes();
  const req = {
    method: 'GET',
    query: { id: 'not-an-objectid' },
    headers: {},
  } as any;

  await handler(req, res);

  if (out.statusCode !== 400) {
    throw new Error(`Expected 400 for invalid tournament ID, got ${out.statusCode} body=${JSON.stringify(out.body)}`);
  }
  const err = (out.body as any)?.error;
  if (err !== 'Invalid tournament ID') {
    throw new Error(`Expected error \"Invalid tournament ID\", got ${JSON.stringify(out.body)}`);
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

