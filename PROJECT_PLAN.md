# Matchpoint MVP — Project Plan

**Goal:** Launch a professional, simple beach volleyball tournament app on Play Store before **April 10, 2026**  
**Timeline:** ~5 weeks from today (March 6, 2026)

---

## 0. Pre-Development Decisions

### Branding & Identity

| Item | Decision |
|------|----------|
| App name | Matchpoint |
| Developer / Copyright | **Miralab** — displayed everywhere required |
| Logo | Placeholder |
| Typography | Modern sans-serif (most common) |
| Colors | Yellow + violet (highlights), dark grey (background), light grey (text) |
| Tone | Casual |

### Miralab Attribution (where to display)

| Location | Content |
|----------|---------|
| App config (`app.json`) | `author`, `owner` |
| Play Store listing | Developer: Miralab |
| Splash screen | © 2026 Miralab |
| Profile / About screen | "Matchpoint by Miralab" |
| Privacy policy | © Miralab |
| Terms of service | © Miralab |
| App footer / settings | © 2026 Miralab |

### Auth & User Model

| Item | Decision |
|------|----------|
| Auth method | Social login only (Google, Apple) |
| Auth data | Email, first name, last name, gender (from provider) |
| Profile fields | Email, phone, first name, last name, gender, avatar |
| Phone | Private (not visible to other users); country code required for validation |
| Avatar | Initials (first + last name), background: light blue (guys), pink (girls), dark grey (other/unknown) |
| Account deletion | Supported |

### Data Categories

| Category | What we collect |
|----------|-----------------|
| **Auth** | Email, first name, last name, gender (from Google/Apple) |
| **Profile** | Email, phone, first name, last name, gender, avatar (initials) |
| **Usage** | Tournament joins, team creation, entries — operational data needed for the app to function (who joined what, which teams exist, etc.) |

### Tournament Rules

| Item | Decision |
|------|----------|
| Team size | 2 (beach volley) |
| Max teams | Default 16, **configurable** |
| Status → full | Automatic when maxTeams reached |
| Entry rules | Invite-only via access link |
| Organizer powers | Edit details, delete tournament, remove players/teams, cancel, promote others to organizer |
| Multiple organizers | Yes — can have more than one |
| Last organizer leaves | Tournament cancelled; can promote another before leaving |

### Team Formation

| Item | Decision |
|------|----------|
| Create team | Yes (players who joined the tournament) |
| Join team | Anyone inside the tournament |
| Partner search | **Must have** — players inside tournament + external invite link (invite partner from outside) |

### Technical

| Item | Decision |
|------|----------|
| Domain | miralab.ar (hosted in Argentina); create subdomain matchpoint.miralab.ar |
| Setup required | MongoDB Atlas ✓; Google OAuth, Apple Developer, subdomain — to create |
| MongoDB region | Barcelona, Spain (EU) |
| Offline | Online-only |
| Environment | Single env |

### Legal

| Item | Decision |
|------|----------|
| Privacy policy | Required (draft to be created) |
| Terms of service | Required |
| Data handling | See Data Categories; retention until account deletion; user rights: access, correction, deletion |

### Testing & Launch

| Item | Decision |
|------|----------|
| Test device | Samsung S24 only |
| Test accounts | Solo testing |
| Launch | Public release |
| Animations | None |
| Unit tests | Critical logic only |
| i18n | English & Spanish; **default: English** |
| Loading UI | Skeleton (not spinner) |
| App version | 1.0.0 for launch |

---

## 1. MVP Scope

### In scope (must have)

| Feature | Description |
|---------|-------------|
| **User auth** | Social login (Google, Apple), sign out |
| **User profile** | Email, phone, first name, last name, gender, avatar (initials), editable |
| **Create tournament** | Name, date, location, max teams (configurable), description, invite link |
| **Browse tournaments** | List of tournaments (via invite link to access) |
| **Invite link sharing** | Organizer shares link; only link holders can view/join |
| **Join as player** | Join a tournament via invite link |
| **Create team** | Create a team within a tournament (2 players) |
| **Join team** | Anyone in the tournament can join a team with open slot |
| **Partner search** | Find partner: players inside tournament + external invite link |
| **Tournament detail** | Info, teams, joined players, join button, create/join team |
| **Organizer powers** | Edit details, delete tournament, remove players/teams, cancel, promote others to organizer |
| **My entries** | See tournaments I've joined and my team(s) |

### Out of scope (post-MVP)

- Bracket generation / match scheduling
- Live scores or match results
- In-app chat or messaging
- Push notifications
- Payments or fees
- Social features (follow, friends)
- Admin/organizer dashboard (web)
- iOS version (Android only for MVP)

---

## 2. User Flows

### Flow A: Organizer creates a tournament

1. Sign in (Google/Apple)
2. Create tournament → form (name, date, location, max teams, description)
3. Tournament appears in "My tournaments"; invite link is generated
4. Share invite link (copy / share)

### Flow B: Player joins tournament and joins a team

1. Sign in (Google/Apple)
2. Open invite link (from organizer) → see tournament detail
3. Join as player
4. Optionally set "Looking for partner" flag
5. Either: create new team OR join existing team with open slot
6. See confirmation: "You're in [Tournament] with [Team]"

### Flow C: Quick check

1. Open app → see "Tournaments" (joined + created) / "My entries" / "Profile"
2. Tap tournament → see details, teams, my team

---

## 3. Data Model (MongoDB)

### Collections

```
users
├── _id
├── email
├── firstName
├── lastName
├── phone
├── gender
├── avatar (initials from firstName+lastName, bg: light blue / pink by gender)
├── authProvider (google | apple)
├── createdAt
└── updatedAt

tournaments
├── _id
├── name
├── date (ISO)
├── location (string)
├── description (optional)
├── maxTeams (number, configurable, default 16)
├── inviteLink (unique token for access)
├── status: "open" | "full" | "cancelled"  // full = auto when maxTeams reached
├── organizerIds: [userId, ...]  // multiple organizers; can promote others
├── createdAt
└── updatedAt

teams
├── _id
├── tournamentId
├── name (e.g. "Team Alpha")
├── playerIds: [userId, userId]  // 2 for beach volley
├── createdBy (userId)
├── createdAt
└── updatedAt

entries
├── _id
├── tournamentId
├── userId
├── teamId (null if not yet in a team)
├── lookingForPartner (boolean)
├── status: "joined" | "in_team"
├── createdAt
└── updatedAt
```

### Rules (App Services)

- Users can only edit their own profile
- Only organizers can edit details, delete tournament, remove players/teams, cancel, promote others
- Only team members can edit their team
- Entries: user can create own, update own (e.g. join team, set lookingForPartner)
- Tournament access: only via valid invite link (or if createdBy)

---

## 4. App Screens (Simple)

| Screen | Purpose |
|--------|---------|
| **Splash** | Brand + auth check |
| **Sign In** | Social login (Google, Apple) |
| **Home** | Tabs: Tournaments \| My Entries \| Profile |
| **Tournaments** | Tournaments I've joined + created (or join via link) |
| **Join via link** | Open/paste invite link → tournament detail |
| **Tournament Detail** | Info, teams, join button, create/join team, partner search (in-tournament + invite link) |
| **Create Tournament** | Form (name, date, location, max teams, description) |
| **Create Team** | Form within tournament |
| **Profile** | First name, last name, phone, gender, avatar (initials), sign out, delete account |

**Total: ~10 screens** — minimal, achievable.

---

## 5. Timeline (5 weeks)

### Week 1 (Mar 6–12): Foundation

| Day | Task |
|-----|------|
| 1–2 | Set up Expo project, Expo Router, TypeScript, NativeWind, i18n (en, es) |
| 2–3 | MongoDB Atlas: cluster, App Services app, Auth (Google, Apple) |
| 3–4 | Collections: users, tournaments, teams, entries + rules |
| 4–5 | Connect app to App Services, test social auth (sign in, sign out) |
| 5 | Basic navigation structure (tabs, auth flow), lib/ structure |

**Milestone:** User can sign in (Google/Apple) and see empty home screen.

---

### Week 2 (Mar 13–19): Tournaments

| Day | Task |
|-----|------|
| 1–2 | Tournaments list (joined + created), join-via-link flow |
| 2–3 | Tournament detail screen (invite-only access) |
| 3–4 | Create tournament form + invite link generation |
| 4–5 | Share invite link, polish list/detail |

**Milestone:** Organizer can create tournaments and share link; players can join via link.

---

### Week 3 (Mar 20–26): Entries & Teams

| Day | Task |
|-----|------|
| 1–2 | Join as player (create entry), partner search (in-tournament + external invite link) |
| 2–3 | Create team flow (name + add self, 1 slot open) |
| 3–4 | Join team flow (fill open slot) |
| 4–5 | My Entries tab + team display, organizer remove player/team |

**Milestone:** Players can join tournaments, create/join teams, find partner (in-tournament or via link); organizer can edit, delete, remove.

---

### Week 4 (Mar 27 – Apr 2): Polish & Testing

| Day | Task |
|-----|------|
| 1–2 | Profile screen (first name, last name, phone, gender, avatar, sign out, delete account) |
| 2–3 | UI polish: loading states, empty states, error handling |
| 3–4 | Edge cases: full tournament, full team, duplicate entry |
| 4–5 | Unit tests (auth, validation, data transforms), internal testing, bug fixes |

**Milestone:** App feels complete and stable.

---

### Week 5 (Apr 3–9): Launch Prep

| Day | Task |
|-----|------|
| 1–2 | EAS Build setup, Android signing, first production build |
| 2–3 | Universal links: host AASA + assetlinks on matchpoint.miralab.ar; web fallback page (download) |
| 3–4 | Play Store listing: screenshots, description, privacy policy, developer: Miralab |
| 4–5 | Submit to Play Store, address review feedback |
| 5 | Buffer / final fixes |

**Milestone:** App submitted (or live) on Play Store.

---

## 6. Tech Stack Summary

| Component | Choice |
|-----------|--------|
| Mobile | Expo + React Native + TypeScript |
| Navigation | Expo Router (file-based) |
| State | Zustand (minimal) + TanStack Query (server state) |
| Styling | NativeWind (Tailwind) |
| Forms | react-hook-form + zod |
| i18n | expo-localization + i18n-js (en, es) |
| Backend | MongoDB Atlas App Services (Data API REST) |
| Auth | App Services + Google + Apple (social login) |
| Utils | nanoid (invite tokens) |
| Deployment | EAS Build → Play Store |

---

## 7. Technical Decisions

### Deep Linking

| Item | Decision |
|------|----------|
| Format | Universal links: `https://matchpoint.miralab.ar/t/{token}` |
| Domain | miralab.ar (subdomain: matchpoint.miralab.ar) |
| Fallback | Open app if installed; else web/Play Store |
| Config | `expo-linking` + `app.json` schemes, intent filters |

### Project Structure (by type)

```
app/              # Expo Router screens
components/       # Reusable UI components
hooks/            # Custom hooks
lib/              # API client, auth, utils
stores/           # Zustand stores
types/            # Shared TypeScript types
locales/          # i18n (en, es)
```

### Data Layer

| Item | Decision |
|------|----------|
| API | MongoDB Data API (REST) |
| Pattern | Centralized in `lib/` (e.g. `lib/tournaments.ts`, `lib/entries.ts`) |
| Server state | TanStack Query for fetch, cache, refetch |

### Forms & Validation

| Item | Decision |
|------|----------|
| Library | react-hook-form + zod |
| Schemas | Reuse for client validation; align with server where possible |

### Error Handling

| Item | Decision |
|------|----------|
| Network | Retry, offline message, error boundaries |
| Auth | Redirect to sign-in on 401; clear session |
| User-facing | Simple, consistent messages (no raw errors) |

### TypeScript

| Item | Decision |
|------|----------|
| Strict mode | On from start |
| Types | Shared in `types/` (User, Tournament, Team, Entry) |
| API responses | Typed; no `any` |

### Auth Flow

| Item | Decision |
|------|----------|
| Session | App Services handles token/refresh |
| Protected routes | Layout/wrapper checks auth |
| Sign-out | Clear local state + App Services session |

### Invite Link Token

| Item | Decision |
|------|----------|
| Format | nanoid (12 chars, URL-safe) |
| Storage | `tournaments.inviteLink` |
| Uniqueness | Per tournament |

### Avatar Component

| Item | Decision |
|------|----------|
| Props | `firstName`, `lastName`, `gender` |
| Logic | Compute initials + bg color: light blue (guys), pink (girls), dark grey (other/unknown) |
| Variants | sm, md, lg for list/detail/profile |

### Testing & i18n

| Item | Decision |
|------|----------|
| Unit tests | Critical logic only (auth, validation, data transforms) |
| i18n | English & Spanish from start; `locales/en.json`, `locales/es.json` |

---

## 8. Success Criteria for MVP

- [ ] User can sign in (Google/Apple)
- [ ] Organizer can create tournament, share invite link, edit details, delete tournament, remove players/teams
- [ ] Player can join a tournament
- [ ] Player can create or join a team (2 players), find partner (in-tournament or via invite link)
- [ ] User can see their entries and teams
- [ ] App is published on Play Store
- [ ] No critical bugs during basic flows

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Play Store review takes >1 week | Submit by Apr 3; have privacy policy ready |
| App Services learning curve | Use Data API + fetch if Realm SDK is complex |
| Scope creep | Stick to this list; log ideas for v1.1 |
| Solo dev bottleneck | Prioritize; use MVP cut list if needed |

---

## 10. MVP Cut List

*If time runs short, cut in this order. Everything else is must-have.*

| Priority | Cut | Impact |
|----------|-----|--------|
| 1 | Avatar: two bg colors (light blue/pink) → single color | Low — one initials component |
| 2 | Share: native share sheet → copy link only | Low — simpler UX |
| 3 | Partner search: dedicated list screen → inline in tournament detail | Low — same data, simpler UI |

**Do not cut:** Social auth, invite link, configurable max teams, partner search (in-tournament + external link), organizer edit/delete/remove, profile fields (phone, gender), account deletion.

---

## 11. Definition of Done (per feature)

- Works on Android (physical device or emulator)
- No console errors in happy path
- Basic error handling (e.g. network failure)
- Fits existing navigation and styling

---

*Document created: March 6, 2026*  
*Next step: Week 1, Day 1 — Scaffold Expo project*
