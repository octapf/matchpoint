# Contributing

## Workflow

1. Branch from `main` (or your team’s default branch).
2. Make focused changes; keep commits readable.
3. Run **`npm run verify`** before opening a PR (same as CI: TypeScript `tsc --noEmit`).
4. If you change behavior, env vars, or scripts, update **README** and/or **`docs/`** in the same PR (see [docs/MAINTENANCE.md](docs/MAINTENANCE.md)).

---

## Local checks

| Command | What it does |
|---------|----------------|
| `npm run verify` | Typecheck (`tsc --noEmit`) |
| `npm run typecheck` | Same, explicit name |

No separate `lint` script yet; follow existing TypeScript strictness and project style.

---

## Documentation audience

This repo is written so that:

- **Reviewers and hiring managers** can skim the README for problem, outcome, and stack.
- **Developers** can clone, set `.env`, and run using [docs/SETUP.md](docs/SETUP.md).

If you add a feature, add a sentence to README or link a short note under `docs/` so the “first clone” path stays honest.
