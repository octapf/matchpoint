# Dev tournament seed — users, passwords, teams

## From the app (admin)

Sign in as an **admin**, open **Profile → Admin → Dev seed** (`/admin/seed`). You can **Generate** or **Regenerate** seed data and **copy** each username (and password, tournament ID, invite token). Same logic as the API/CLI below.

## Run the seed (CLI)

From the `matchpoint` project root (with `MONGODB_URI` in `.env`):

```bash
npm run seed:dev
```

Re-run after changing the script or to refresh data (deletes the previous seed tournament, teams, entries, and seed users):

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

## Tournament

| Field        | Value |
|-------------|--------|
| Name        | Summer Beach Cup (Seed) |
| Invite link | `seed-dev-beach-cup` |
| Dates       | 2026-07-15 |
| Location    | Barceloneta Beach |
| Organizer   | First seed user (Seed 1) |

---

## Password (email sign-in)

**All 16 seed accounts use the same password:**

`SeedDev1!`

Sign in with **email** `seed.player01@matchpoint.dev` … `seed.player16@matchpoint.dev` **or** username `seed_player01` … `seed_player16`.

---

## Users (16)

| # | Email | Username | Name |
|---|--------|----------|------|
| 1 | seed.player01@matchpoint.dev | seed_player01 | Seed 1 |
| 2 | seed.player02@matchpoint.dev | seed_player02 | Seed 2 |
| 3 | seed.player03@matchpoint.dev | seed_player03 | Seed 3 |
| 4 | seed.player04@matchpoint.dev | seed_player04 | Seed 4 |
| 5 | seed.player05@matchpoint.dev | seed_player05 | Seed 5 |
| 6 | seed.player06@matchpoint.dev | seed_player06 | Seed 6 |
| 7 | seed.player07@matchpoint.dev | seed_player07 | Seed 7 |
| 8 | seed.player08@matchpoint.dev | seed_player08 | Seed 8 |
| 9 | seed.player09@matchpoint.dev | seed_player09 | Seed 9 |
| 10 | seed.player10@matchpoint.dev | seed_player10 | Seed 10 |
| 11 | seed.player11@matchpoint.dev | seed_player11 | Seed 11 |
| 12 | seed.player12@matchpoint.dev | seed_player12 | Seed 12 |
| 13 | seed.player13@matchpoint.dev | seed_player13 | Seed 13 |
| 14 | seed.player14@matchpoint.dev | seed_player14 | Seed 14 |
| 15 | seed.player15@matchpoint.dev | seed_player15 | Seed 15 |
| 16 | seed.player16@matchpoint.dev | seed_player16 | Seed 16 |

---

## Teams (7)

| Team | Players |
|------|---------|
| Team Alpha | Seed 1, Seed 2 |
| Beach Kings | Seed 3, Seed 4 |
| Sand Setters | Seed 5, Seed 6 |
| Net Ninjas | Seed 7, Seed 8 |
| Spike Squad | Seed 9, Seed 10 |
| Need Partner A | Seed 11 (open slot) |
| Need Partner B | Seed 12 (open slot) |

**Solo / looking for partner (no team yet):** Seed 13, Seed 14, Seed 15, Seed 16.

---

## If you seeded before passwords existed

Run once with:

```bash
npm run seed:dev:force
```

so users are recreated **with** `passwordHash` and `username`.

Use a **development** MongoDB URI, not production.
