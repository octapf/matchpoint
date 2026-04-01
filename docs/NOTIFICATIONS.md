## Notifications (in-app inbox)

### Scope

- **Channel**: in-app only (no push).
- **Retention**: auto-delete after **30 days** via MongoDB TTL index.
- **Audience**: match schedule/start/end notifications go to **both teams** (players), not organizers.
- **Frequency**: no per-point notifications; only schedule/start/end/assignment/classification, etc.

### Data model (MongoDB)

Collection: `notifications`

- `userId: string` recipient user id
- `type: string` notification type (client renders via i18n)
- `params?: object` translation params
- `data?: object` deep link payload (e.g. `tournamentId`, `matchId`)
- `dedupeKey?: string | null` optional dedupe key (upserted when present)
- `readAt?: string | null` ISO timestamp
- `createdAt: string` ISO timestamp

Indexes:

- `notifications_user_createdAt`: `{ userId: 1, createdAt: -1 }`
- `notifications_user_dedupe`: `{ userId: 1, dedupeKey: 1 }`
- `notifications_ttl_30d`: `{ createdAt: 1 }` with `expireAfterSeconds = 2592000`

### API

Reuses `api/users.ts` (keeps Vercel function count stable).

- **List**: `GET /api/users?type=notifications&limit=30&cursor=<createdAtISO>`
- **Mark read**: `POST /api/users` body `{ "action":"notifications.markRead", "ids":[...] }`
- **Mark all read**: `POST /api/users` body `{ "action":"notifications.markAllRead" }`

### Types

Client types live in `types/index.ts` as `Notification` + `NotificationType`.

### Emission points (current)

- **Join waitlist**: `api/entries.ts` → `tournament.waitlistJoined`
- **Team created**: `api/teams.ts` → `team.created`
- **Team dissolved**: `api/teams/[id].ts` → `team.dissolved`
- **Match scheduled**: `api/tournaments/[id].ts` action `updateMatch` when `scheduledAt` changes → `match.scheduled` (both teams)
- **Match started**: `api/tournaments/[id].ts` action `startMatch` → `match.started` (both teams)
- **Referee assigned**: `api/tournaments/[id].ts` actions `claimReferee` / `startMatch` → `match.refereeAssigned` (referee only)
- **Match ended**: `api/tournaments/[id].ts` actions `refereePoint` (auto-complete) and `updateMatch` finalize → `match.ended` (both teams)
- **Classification**: `api/tournaments/[id].ts` action `finalizeClassification` → `tournament.classified`

### UI

- Inbox screen: `app/(tabs)/notifications.tsx`
- Tab entry: `app/(tabs)/_layout.tsx`
- Translations: `lib/i18n/en.json`, `es.json`, `it.json`

