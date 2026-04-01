## Realtime scoring (polling + single-editor lock)

Matchpoint uses **HTTP polling** (not WebSockets) for live score updates. Live scoring is protected by a **single-editor referee lock** so only one actor can modify the score at a time.

### Why polling (vs WebSockets)

- Vercel serverless is optimized for short requests, not long-lived WebSocket connections.
- At expected concurrency (\(~100\) users) and a modest interval (7s), polling is simple and reliable.
- All clients can always recover state with a normal GET after reconnect.

### Client polling behavior

- **Matches list / fixture tabs**: poll match summaries every **7 seconds** while the tab is focused.
- **Match detail**: poll every **7 seconds** while the screen is open.
- Polling should stop in background / when screen is not focused (React Query handles this via screen-level enabling).

### Single editor model (referee lock)

Each match may have a current referee editor:

- `refereeUserId`: current editor user id
- `refereeLockExpiresAt`: ISO timestamp; lock is considered active if it is in the future

Defaults:

- **Lock expiry**: 15 seconds
- **Heartbeat**: every 5 seconds (only sent by the current referee while the match is in progress)

If the referee app loses network or closes, the lock expires quickly and another authorized user can take over.

### Takeover rules (override takeover = YES)

If a match is locked by another referee (lock active), a takeover is allowed when:

- actor is an **organizer** or **admin**, or
- actor is the **other player on the current referee team** (teammate takeover)

All other users receive a 409 conflict.

### API shape (existing action endpoint)

All actions are sent via:

`POST /api/tournaments/:tournamentId`

The body must include `action`.

#### 1) Claim referee (start as referee)

Request:

```json
{ "action": "claimReferee", "matchId": "MATCH_ID", "mode": "claim" }
```

Behavior:

- If match is unlocked/expired: becomes referee and starts the match (status `in_progress`), initializes serve state.
- If match lock is active and another referee holds it: returns **409**.
- Non-organizer/admin referees must belong to an eligible referee team (same slice, not playing).

#### 2) Takeover referee (override)

Request:

```json
{ "action": "claimReferee", "matchId": "MATCH_ID", "mode": "takeover" }
```

Behavior:

- If match is `in_progress`: switches `refereeUserId` to the actor and renews `refereeLockExpiresAt`.
- If locked by someone else: takeover is allowed only for organizer/admin or referee teammate.
- Does **not** reset score/serve state.

Conflict response (409):

```json
{
  "error": "Match is locked by another referee",
  "refereeUserId": "CURRENT_REF_ID",
  "refereeLockExpiresAt": "ISO"
}
```

#### 3) Heartbeat

Request:

```json
{ "action": "refereeHeartbeat", "matchId": "MATCH_ID" }
```

Behavior:

- Only succeeds when actor is current `refereeUserId` and lock is active.
- Extends `refereeLockExpiresAt` by 15s.

If the lock was lost/expired:

```json
{
  "error": "Referee changed",
  "refereeUserId": "CURRENT_REF_ID_OR_NULL",
  "refereeLockExpiresAt": "ISO_OR_NULL"
}
```

#### 4) Live scoring mutations

Example:

```json
{ "action": "refereePoint", "matchId": "MATCH_ID", "side": "A", "delta": 1 }
```

Rules:

- Requires `refereeUserId === actor` and lock active (`refereeLockExpiresAt > now`).
- If lock is missing/expired or referee changed: **409** `"Referee changed"`.

Other score-related actions (e.g. `setServeOrder`) follow the same lock rule.

### UI rules

- **Only the current referee** can tap to increment/decrement points.
- Organizers/admins (and referee teammate) see a **Take control** button when another referee is active.
- On 409 `"Referee changed"`, the client should disable referee controls and rely on the next poll to refresh state.

