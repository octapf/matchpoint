# ADR 001: Mobile stack and hosting

**Status:** Accepted  
**Context:** Beach volleyball tournament product — invite links, teams, entries, social login.

---

## Decision

- **Client:** Expo (React Native), Expo Router, TypeScript, NativeWind, TanStack Query, Zustand.
- **API:** Vercel serverless functions under `api/`, Node runtime.
- **Database:** MongoDB Atlas, single database `matchpoint`, document collections for users, tournaments, teams, entries.

---

## Rationale

- **Expo** speeds up cross-platform delivery and OTA workflows; Play Store deployment via EAS matches Miralab’s Android-first MVP.
- **Vercel** fits a small HTTP API with sporadic traffic: no long-lived server to operate; colocate API with optional static web for invite fallbacks.
- **MongoDB** matches flexible tournament/entry documents and rapid iteration without a rigid relational schema for the MVP.

---

## Consequences

- Serverless cold starts and connection pooling patterns must follow Atlas/Vercel best practices (`api/lib/mongodb.ts` reuses the client).
- `EXPO_PUBLIC_*` variables are public; secrets stay on Vercel only.
- Deep linking and OAuth require correct env per environment (see [../SECRETS.md](../SECRETS.md)).

---

## Review

Revisit if traffic, transactions, or compliance requirements outgrow serverless + document store (e.g. need strong relational invariants or dedicated auth service).
