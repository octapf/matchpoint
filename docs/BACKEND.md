# Backend (API) operations

Vercel serverless routes under `api/`, shared helpers under `server/lib/`. Database: MongoDB Atlas (or any replica-set deployment); the app uses database name **`matchpoint`**.

For a full list of environment variables (auth, email, client IDs), see [SECRETS.md](./SECRETS.md).

---

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `MONGODB_URI` | Yes (production) | Connection string; `getDb()` uses database `matchpoint`. |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated origins (e.g. `https://app.example.com,https://your-app.vercel.app`). If set, a request whose `Origin` matches an entry gets that origin echoed; otherwise `Access-Control-Allow-Origin` is `*`. Native apps often omit `Origin` and still work with Bearer auth. |
| `VERCEL_GIT_COMMIT_SHA` | Auto on Vercel | Shown as `revision` in `/api/health`. Locally falls back to `GIT_COMMIT_SHA`, `npm_package_version`, or `dev`. |

Other server variables (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `APP_URL`, etc.) are documented in [SECRETS.md](./SECRETS.md).

---

## Health check

`GET /api/health` — no authentication.

- **200** — `{ ok: true, db: true, revision }` after a MongoDB `ping`.
- **503** — `ok: false`, `db: false`, plus `error` (`Database not configured` if `MONGODB_URI` is missing, or `Database unreachable` on failure).

Use this for uptime checks and deploy verification (compare `revision` to the commit you expect).

---

## Security headers

`withCors(req, res)` sets CORS plus baseline headers: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. All API handlers should use `withCors` so behavior stays consistent.

---

## API version

Responses include **`X-Matchpoint-Api-Version`** (currently `1`, see `MATCHPOINT_API_VERSION` in `server/lib/cors.ts`). Bump the constant when you introduce breaking JSON shape changes and document them for mobile clients.

---

## Rate limiting (auth)

`api/auth/*` applies per-IP limits in-process (`server/lib/rateLimit.ts`): Google sign-in, email auth routes, and `/auth/me`. Limits are **per serverless instance**; for distributed enforcement in production, add Redis (e.g. Upstash) and reuse the same key scheme.

---

## Pagination (list GETs)

Optional query params: **`limit`** (default 200 when used, max 500) and **`offset`**. If **neither** is sent, list endpoints behave as before (no skip/limit). Applies to **`GET /api/tournaments`**, **`GET /api/entries`**, **`GET /api/teams`** when listing.

---

## Validation

Write routes use **Zod** schemas under `server/lib/schemas/` where practical (`POST` teams, waitlist, entries, tournaments create, admin actions, tournament `action` bodies, `PATCH` users/entries/teams).

---

## Admin audit trail

Successful **`POST /api/admin`** actions append documents to **`admin_audit_logs`** (`insertAuditLog` in `server/lib/auditLog.ts`): actor id, action name, optional resource id, JSON `meta`, client IP, `createdAt`. Indexes are created by `npm run db:indexes` and `ensureDbIndexes`.

---

## Automated tests

Run **`npm run test`** (Vitest): schema/rate-limit unit tests and API version pin. Full HTTP integration tests against a live API + MongoDB are not in-repo by default; add them behind `MONGODB_URI` or a test container when you are ready.

---

## MongoDB transactions

`DELETE /api/users` runs critical steps (entries, waitlist, teams, tournament organizer fields, match referee fields, user document) inside a **multi-document transaction**.

Transactions require a **replica set** (MongoDB Atlas provides this by default). A **standalone** local MongoDB will fail `withTransaction` until you use a replica-set connection string or adjust local setup (e.g. run a single-node replica set for development).

---

## Indexes

Create or refresh indexes (idempotent):

```bash
npm run db:indexes
```

Requires `MONGODB_URI` in `.env`. The script is defined in `scripts/create-indexes.ts`. Production clusters may also use `ensureDbIndexes` in `server/lib/dbIndexes.ts` where wired.

---

## Backups and recovery (drill)

1. **Atlas:** Confirm continuous backup / snapshot policy matches your RPO/RTO; test a restore to a temporary cluster at least yearly.  
2. **After restore:** Redeploy or bump `revision` only if code changed; data is the main concern.  
3. **Secrets:** Restored data does not restore Vercel env vars — keep [SECRETS.md](./SECRETS.md) procedures for rotation.

Document who is allowed to trigger restore and how incidents are communicated.

---

## Logging and errors

`server/lib/observability.ts` exposes `logApi(level, message, fields?)` for JSON-style structured logs and **`captureException(err, context?)`**. When **`SENTRY_DSN`** is set, `captureException` reports to Sentry (initialized once per cold start). Admin route handlers call `captureException` on 500s.

Avoid logging PII, passwords, or full request bodies in production logs.

---

## Backup drill (calendar)

Schedule at least **yearly**: restore an Atlas snapshot to a **temporary** cluster, verify app connectivity with a read-only check, then tear down. Record date, owner, and any gaps in runbooks.

---

## Related docs

| Document | Topic |
|----------|--------|
| [SECRETS.md](./SECRETS.md) | Where variables are set |
| [EXPO_AND_VERCEL.md](./EXPO_AND_VERCEL.md) | Client API URL and deploy |
| [SETUP.md](./SETUP.md) | Local API via `vercel dev` |
