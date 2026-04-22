## Business rules captured from April 2026 chat

This document consolidates **product requirements and business rules** that were requested incrementally in chat while implementing tournament roster, guest players, team creation, groups, and match flow.

It complements (and does not replace) the more formal tournament flow spec in `docs/TOURNAMENT_FLOW_AND_CATEGORIES.md`.

---

## 1) Roles & permissions (RBAC)

- **Admin**
  - Full tournament management privileges (same as organizer, plus any global admin privileges).
- **Organizer (of a given tournament)**
  - Can manage tournament roster (including guest players), teams, groups, tournament actions (start tournament, create/reorganize groups, etc).
- **Regular player**
  - Can participate in roster/waitlist and (depending on tournament state) create a team under restrictions described below.

### Organizer/admin checks

- Wherever the UI/API says "organizer/admin", the intent is:
  - **Admin OR tournament organizer**.

---

## 2) Guest players (invitados)

### Definition

- A **guest player** is a physical player **without an app account**, scoped to **one tournament**.
- Guest players are stored in `tournament_guest_players`.
- A guest may appear on `teams.playerIds` as a **slot string**: `guest:<guestObjectIdHex>`.

### Visibility

- **All users who can access the tournament** can see guest players in the tournament detail.
- Guest players should appear **in the main Players tab list**, not a separate section.
- Guest players must have a **visual indicator** (icon/pill) so they are clearly identifiable as guests.

### Create / edit / delete rules

- **Only organizers/admins** can:
  - Create guest players
  - Edit guest players
  - Delete guest players

### Delete behavior (business requirement)

- Organizers/admins must be able to delete guest players from the Players list using a **trash** icon.
- Deleting a guest player must be allowed even if the guest is currently on a team, with the following behavior:
  - The team is **dissolved**
  - The remaining real player returns to **"no team"** (roster state)

### No limits / no CSV

- No maximum limit for guest players.
- No CSV import for guest players.

### UI requirements

- Guest players in lists must use the same **Avatar** style as real users, including **gender-based colors**.
- Guest player rows must include:
  - Guest indicator
  - Organizer/admin actions (edit + delete where applicable)

---

## 3) Players tab (Jugadores) behavior

### Unified list

- Guest players must be displayed in the Players tab together with real users.
- There must be a **count of "players without a team"** that includes both:
  - real users without a team
  - guest players not currently on a team

### "Checked" icon

- The "checked" indicator for players with a team was explicitly removed as it added no value.

### Edit action for guests

- In Players tab, guest rows must show an **edit (pencil)** action for organizers/admins.
- Editing a guest must not show the create form "behind" (no modal-on-top-of-create confusion).
  - The screen should be reused in a clear **edit mode**.

---

## 4) Team creation rules

### General

- Teams are pairs of player slots (`teams.playerIds` has 2 items).

### Organizer/admin

- Can create teams freely from:
  - 2 real users
  - 1 real user + 1 guest
  - **2 guests** (explicitly required)

### Non-organizer/non-admin

- May create a team with another real user or a guest **only if**:
  - They are **included as one of the two members** (self must be in the team).
  - They are **not already in any team** in the tournament.
- If the user already has a team:
  - Hide the "Create team" button for non-organizers/admins.

### Create-team UI

- The create team panel must be minimal:
  - Only placeholders for each slot
  - Remove redundant titles/hints like “Jugadores 2”, “Elegí jugador 1/2”, “Compañero - elegí alguien”, etc.
- Guest lists in team creation must show avatars with gender-specific colors.

### Organizer/admin create-team panel (batch UX)

- Same **mental model as guest players**: one screen to add many items without leaving.
- After a successful create:
  - **Do not navigate away**; reset the form so the organizer can create another team.
  - The new team appears in the **list below** (optimistic update + query refresh), scoped to the **current division** tab (`men` / `women` / `mixed`).
- The panel shows:
  - Short organizer hint (`tournamentDetail.organizerCreateTeamHint`)
  - Name + player pickers (waitlist users + guests)
  - **Create team** button
  - **Teams in this division** list with count; each row is tappable to open **edit team** for that row.
- Implementation lives mainly in `components/team/OrganizerTeamForm.tsx` (used by `app/tournament/[id]/team/create-organizer.tsx`).

---

## 5) Groups (Grupos) creation & constraints

### When to show “Create groups”

- In the Groups tab, show a **Create groups** button for organizers/admins **only when**:
  - The tournament is **full** (teams count reached `maxTeams`), and
  - Groups have not been created yet (no distribution marker / no assigned groupIndex).

### Before groups exist

- When groups are not created yet:
  - The Groups tab must show only a **legend/explanation** and (if allowed) the **Create groups** CTA.
  - It must not show empty group blocks or extra controls.

### After tournament starts

- After the tournament is started:
  - Reorganizing groups must be blocked.
  - Even if tournament state is inconsistent, **any started/completed match** should prevent group reorg.

---

## 6) Matches & tournament lifecycle (order of operations)

This is the required order (high-level):

1. **Teams are created** until tournament capacity is reached.
2. Organizer/admin **creates groups** (distribution).
3. When groups are created/reorganized:
   - Generate **classification matches** (all scheduled matches to be played).
   - Ensure **category matches (Gold/Silver/Bronze)** do **not** exist yet.
4. Organizer/admin **starts the tournament** (tournament becomes “started”).
5. Referees can **start matches** (turn scheduled → in progress) only after tournament is started.
6. After **all classification matches** are completed:
   - Generate **category brackets/matches** based on configuration (Gold/Silver/Bronze).

### Category matches must not appear early

- If category matches exist from a prior run, they must be cleared when groups are (re)created so that users do not see Gold/Silver/Bronze before classification completes.

### Invariants

- A match cannot be started if the tournament is not started.
- Group randomization/reorganization cannot occur once any match has started/completed.

---

## 7) Tournament “start” gating by date (UX requirement)

- Business rule: starting the tournament is gated by “tournament day”.
  - If the tournament date is not today, **do not start**.
- UX requirement: the **Start tournament button remains visible/usable**, but when pressed on the wrong date:
  - show a message instructing the organizer/admin to **adjust the date**
  - provide a CTA to navigate to tournament edit screen

---

## 8) Environment / release notes (operational)

- Local app may still point to a remote backend via `EXPO_PUBLIC_API_URL`.
  - Differences between “local” and “prod” are often due to:
    - installing a different Play track/build
    - different backend URL/env variables

---

## 9) Source of truth & change management

- When rules change, update:
  - `docs/TOURNAMENT_FLOW_AND_CATEGORIES.md` (flow/categorization/brackets)
  - this document (UI/permissions/guest/team/group invariants)
  - the backend invariants (API guards) so state cannot drift

---

## 10) Team name changes & who may edit a team

### API (`PATCH /api/teams/[id]`)

- **Organizer or app admin** may update `name`, `playerIds`, and `groupIndex` (subject to existing validation: waitlist rules for new real players, group capacity, etc.).
- **A regular player** may call `PATCH` only if their **own `userId` is in `teams.playerIds`** (they are on that team). In that case they may send **`name` only**; `playerIds` and `groupIndex` are rejected with a clear error (roster/group remain organizer-only).
- **Guest slots** (`guest:<ObjectId>`) on `playerIds` do not match a logged-in `userId`; only the **registered** teammate can rename from the app unless an organizer/admin does it.

### After the tournament has started

- **Nobody** may change the team **`name`** once the tournament is considered started:
  - `startedAt` is set, **or**
  - `phase` is `classification`, `categories`, or `completed`.
- The API returns a dedicated error string mapped to `apiErrors.teamNameLockedAfterStart`.
- Organizers/admins may still change **roster / group** when the rest of the rules allow it (unless other guards apply); the name field is read-only in the shared forms when started.

### Shared UI (create ↔ edit)

- **Player path:** `components/team/PlayerTeamForm.tsx` — used by `app/tournament/[id]/team/create.tsx` (create) and by `app/tournament/[id]/team/[teamId].tsx` (edit as team member).
- **Organizer/admin path:** `components/team/OrganizerTeamForm.tsx` — used by `create-organizer.tsx` (create) and by `[teamId].tsx` (edit).
- **Tournament detail → Teams / Groups tabs:** tapping a team card opens `/tournament/{id}/team/{teamId}?division=...` when:
  - the viewer is **organizer or admin** (always, including after start — to adjust roster where allowed), **or**
  - the viewer is a **player on that team** and the tournament **has not** started (name edit only via form).
- **Admin roster screen** (`app/admin/tournament/[id]/roster.tsx`) remains the bulk roster tool (create/edit/delete teams with pencil); behavior described here is the **in-tournament** flow.

### Helpers / i18n

- `lib/isTournamentStarted.ts` centralizes the same “started?” rule used in UI and should stay aligned with API checks.
- Strings added for this flow live under `team.*`, `tournamentDetail.editTeamA11y`, and `apiErrors.*` (e.g. `onlyOrganizersTeamRosterOrGroup`, `teamNameLockedAfterStart`).

---

## 11) Navigation & stack registration

- Root stack (`app/_layout.tsx`) explicitly registers:
  - `tournament/[id]/team/create-organizer`
  - `tournament/[id]/team/[teamId]`
- So headers and deep links behave like other tournament sub-screens.

---

## 12) Admin tournament edit — embedded maps dev hint

- `TournamentLocationField` supports `showDevMapsKeyHint` (default **true** in dev) for the optional Google Maps embed key hint.
- **Admin tournament edit** passes `showDevMapsKeyHint={false}` so that hint does not clutter the organizer admin form; other screens keep the default unless overridden.

