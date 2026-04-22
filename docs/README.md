# Matchpoint documentation

| Document | Purpose |
|----------|---------|
| [SETUP.md](./SETUP.md) | Clone, install, env, run app + API locally, builds |
| [BACKEND.md](./BACKEND.md) | API health, CORS, versioning, rate limits, pagination, Sentry, audit logs, tests |
| [SECRETS.md](./SECRETS.md) | Where each variable lives (never commit real secrets) |
| [EXPO_AND_VERCEL.md](./EXPO_AND_VERCEL.md) | Expo Go vs dev build, API URL, deep links |
| [MAINTENANCE.md](./MAINTENANCE.md) | When to refresh docs (e.g. quarterly) |
| [TOURNAMENT_FLOW_AND_CATEGORIES.md](./TOURNAMENT_FLOW_AND_CATEGORIES.md) | Tournament lifecycle, categories, brackets, organizer rules |
| [TOURNAMENT_PAUSE_AND_SCORE_BETTING.md](./TOURNAMENT_PAUSE_AND_SCORE_BETTING.md) | Pause/resume tournament day, gating live play and bets, score-bet rules (picker + API), related files and EAS build hint |
| [BUSINESS_RULES_FROM_CHAT_2026-04.md](./BUSINESS_RULES_FROM_CHAT_2026-04.md) | Consolidated business rules from April 2026 implementation chat (guests, teams, groups, start gating, team edit/rename, organizer multi-create, admin maps hint) |
| [TOURNAMENTS_CALENDAR.md](./TOURNAMENTS_CALENDAR.md) | Feed tournament calendar: preset colors, layout pitfalls (`react-native-calendars` theme merges, `dayComponent`, ScrollView + Provider) |
| [adr/001-stack-and-hosting.md](./adr/001-stack-and-hosting.md) | Why this stack (architecture decision) |

**Existing project notes** (root): `VERCEL_DEPLOY.md`, `MONGODB_SETUP.md`, `DOMAIN_SETUP.md`, `CONNECT-DEVICE.md`, `PROJECT_PLAN.md`.

**Contributing:** see [CONTRIBUTING.md](../CONTRIBUTING.md) at repo root.
