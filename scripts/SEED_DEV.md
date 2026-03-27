# Dev tournament seed — users, rules, teams

## From the app (admin)

Sign in as an **admin**, open **Profile → Admin → Dev seed** (`/admin/seed`). You can **Generate** or **Regenerate** seed data and **copy** each username (and password, tournament ID, invite token). Same logic as the API/CLI below.

## Run the seed (CLI)

From the `matchpoint` project root (with `MONGODB_URI` in `.env`):

```bash
npm run seed:dev
```

Re-run after changing the script or to refresh data (deletes previous seeded tournament, teams, entries, waitlist, and seed users):

```bash
npm run seed:dev:force
```

**Remove all seed data** (tournament `seed-dev-beach-cup`, its teams/entries, and every `seed.playerNN@matchpoint.dev` user):

```bash
npm run seed:dev:purge
```

Same as **Admin → Dev seed → “Remove all seed data”**.

(Uses `tsx scripts/seed-dev-tournament.ts`; do not use `npm run seed:dev -- --force` — npm may treat `--force` as its own flag.)

The command prints the **tournament `_id`** (use it in `/tournament/<_id>`). Invite token is always **`seed-dev-beach-cup`** → `/t/seed-dev-beach-cup`.

Turn **off** `EXPO_PUBLIC_DEV_MOCK_DATA` in the client so the app uses the real API and this data.

---

## Tournament (seeded defaults)

| Field        | Value |
|-------------|--------|
| Name        | Summer Beach Cup (Seed) |
| Invite link | `seed-dev-beach-cup` |
| Dates       | 2026-07-15 |
| Location    | Barceloneta Beach |
| Organizer   | First seed user (Seed 1) |
| Divisions   | Men, Women, Mixed |
| Categories  | Gold, Silver, Bronze |
| Points to win (set) | 21 |
| Sets per match | 1 |
| Teams       | 48 total (16 per division) |
| Groups      | 12 total (4 per division) |
| Entries     | 96 (32 per division) |
| Waiting list| 24 (8 per division) |

---

## Password (email sign-in)

**All 120 seed accounts use the same password:**

`SeedDev1!`

Sign in with **email** `seed.player01@matchpoint.dev` … `seed.player120@matchpoint.dev` **or** username `seed_player01` … `seed_player120`.

---

## Users / teams distribution

- 120 users total:
  - 40 Men
  - 40 Women
  - 40 Mixed (20 men + 20 women)
- Per division:
  - 16 teams (2 players per team) => 32 players in entries
  - 4 groups
  - 8 users in waiting list
- Mixed teams are always **1 man + 1 woman**.

---

## If you seeded before the current format existed

Run once with:

```bash
npm run seed:dev:force
```

so users and tournament data are recreated with the latest format (divisions/categories/match rules).

Use a **development** MongoDB URI, not production.
