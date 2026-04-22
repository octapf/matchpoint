# Tournament pause, live-play gating, and score betting rules

This document describes the behaviour shipped in early 2026 around **pausing the tournament day**, **blocking live play and bets** while paused or before start, and **score-bet validation** (winner must have the higher set score). It complements [TOURNAMENT_FLOW_AND_CATEGORIES.md](./TOURNAMENT_FLOW_AND_CATEGORIES.md).

---

## 1. Tournament pause (`paused`)

### Data model

- Tournament documents may include `paused: boolean` (see `types/index.ts`).
- When `paused === true` and the tournament day has already started, **live match actions and placing bets** are treated like “play not active” (same product idea as before `startedAt` / classification phase).

### Server: actions and persistence

- **POST** tournament actions (schema `server/lib/schemas/tournamentPostAction.ts`):
  - `pauseTournament` — sets `paused: true` (only if the tournament has started).
  - `resumeTournament` — sets `paused: false`.
- Implemented in `api/tournaments/[id].ts` (guest/organizer mutation path).

### Server: who can still do what

- **`server/lib/tournamentLivePlayGate.ts`** — `assertTournamentAllowsLiveMatchActions(db, tournamentId)`:
  - Returns an error if the tournament **has not started** (`Tournament has not started`).
  - Returns an error if the tournament **is paused** (`Tournament is paused`).
- Live mutations that go through this gate include (see `api/tournaments/[id].ts`): referee lock / heartbeat, live point updates, starting a match, serve order, etc., as wired in that handler.
- **Betting** (`server/lib/tournamentBets.ts`): after the day is considered started, placing bets is rejected with `Tournament is paused` if `paused` is true.

### Score bets: extra validation (same release)

- Integer scores **0–35** only.
- **No tie**: `pickPointsA !== pickPointsB`.
- If **winner bets are enabled** and the user already has a **winner** line for that match, the score line must **match** that winner (higher points on the picked team’s side).

Exact API error strings mapped in `lib/utils/apiError.ts` → `apiErrors.*`:

| API `error` string | i18n key |
|--------------------|----------|
| `Tournament is paused` | `apiErrors.tournamentIsPaused` |
| `Score picks cannot be a tie` | `apiErrors.bettingScoreTie` |
| `Score picks must match your winner pick` | `apiErrors.bettingScoreWinnerMismatch` |

---

## 2. Client: when “play” is active

### Shared helpers

- **`lib/tournamentPlayAllowed.ts`**
  - Re-exports `isTournamentStarted` from `lib/isTournamentStarted.ts`.
  - `isTournamentPaused(tournament)`
  - `isTournamentPlayActive(tournament)` — started **and** not paused.

### Tournament detail (`app/tournament/[id].tsx`)

- Derives `tournamentPlayLockedReason`: `'not_started' | 'paused' | null`.
- **Bets**: `canPlaceTournamentBet` requires `isTournamentPlayActive` (not only “day started”).
- **`BetsTab`**: receives `playLockedReason` (replaces the old “day started only” prop).
- **Organizer menu**: Pause / Resume tournament (with confirmations), invalidates matches and betting queries on success.
- **Banner** when started + paused (`tournamentDetail.tournamentPausedHint`).

### Match screen (`app/tournament/[id]/match/[matchId].tsx`)

- Uses `tournamentPlayActive` / `tournamentPlayLockedReason` for banners and disabling live controls.
- **Referee heartbeat** interval does not run when play is not active (avoids useless API calls while paused).
- **Take control** (`claimReferee` takeover) disabled when play is not active.

### Bets tab (`components/tournament/detail/BetsTab.tsx`)

- **Score picker modal** only lists **allowed** integers for the side being edited, given:
  - the other side’s draft value (if any), and
  - the user’s **picked winner** when winner bets are on.
- Goal: **winner’s set score > loser’s**; no ties; consistent with winner pick.
- Submit button stays disabled until the pair is complete and valid.
- Copy keys under `tournamentDetail.*` (e.g. `bettingInvalidScoreTie`, `bettingInvalidScoreVsWinner`, `bettingScoreNoValidChoices`) and `apiErrors.*` above — see `lib/i18n/en.json`, `es.json`, `it.json`.

---

## 3. Related technical pieces (same timeframe)

These files support the above or adjacent behaviour; adjust this list if you refactor.

| Area | Files (indicative) |
|------|---------------------|
| Rally-style set completion | `lib/matchRallyScoring.ts`, usage from `api/tournaments/[id].ts` |
| Normalized Mongo id strings | `lib/mongoId.ts` |
| Bracket UI typing (`paused` match status) | `components/tournament/detail/CategoryBracketDiagram.tsx` |
| ESLint / hooks | `OrganizerTeamForm`: all hooks before any early `return` (see `components/team/OrganizerTeamForm.tsx`) |

---

## 4. Product note: finalizing a match while paused

As of this writing, **`updateMatch` is fully gated** when the tournament is paused (same as other live actions). If product later requires **finalize-only** while paused, that would be a deliberate API exception on top of `assertTournamentAllowsLiveMatchActions`.

---

## 5. Ops: EAS Android production build

From repo root (`matchpoint/`):

```bash
npx eas-cli build --platform android --profile production
```

Non-interactive CI example (requires `EXPO_TOKEN`):

```bash
npx eas-cli build --platform android --profile production --non-interactive
```

See also `package.json` script `eas:build:android` and [SETUP.md](./SETUP.md) / [EXPO_AND_VERCEL.md](./EXPO_AND_VERCEL.md).

---

## 6. Verify script note

`npm run verify` includes a **Vercel serverless function count** check. If the Hobby limit is exceeded, run `npm run typecheck` and `npm run lint` separately until routes are consolidated or the plan is upgraded.
