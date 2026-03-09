# Matchpoint

Beach volleyball tournament app for Android. Create tournaments, invite players, form teams, and manage entries — all with social login (Google & Apple).

**By [Miralab](https://miralab.ar)**

---

## Overview

Matchpoint lets organizers run invite-only beach volleyball tournaments. Players join via access links, create or join 2-person teams, and organizers manage the full lifecycle. The app targets the Play Store as a professional, simple MVP.

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Mobile** | Expo (React Native), Expo Router, NativeWind (Tailwind) |
| **State** | Zustand, React Query |
| **Auth** | Google OAuth, Apple Sign-In |
| **Backend** | Vercel serverless API |
| **Database** | MongoDB Atlas |

---

## Prerequisites

- Node.js 18+
- npm or pnpm
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [EAS CLI](https://docs.expo.dev/build/setup/) (for Android builds)
- MongoDB Atlas cluster
- Google Cloud OAuth credentials (Web + Android client for Android sign-in)
- Apple Developer account (for Apple Sign-In on iOS)

---

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/octapf/matchpoint.git
   cd matchpoint
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env` and fill in:

   - `EXPO_PUBLIC_API_URL` — Vercel API URL (e.g. `https://matchpoint-xxx.vercel.app`)
   - `EXPO_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth Web client ID
   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — Google OAuth Android client ID (for Android sign-in)

3. **Backend (Vercel)**

   - Deploy API: `api/` to Vercel
   - Add env vars: `MONGODB_URI`, `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`

4. **Run locally**

   ```bash
   npm run start
   ```

   Then press `a` for Android or `w` for web.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start Expo dev server |
| `npm run android` | Start with Android |
| `npm run ios` | Start with iOS |
| `npm run web` | Start with web |
| `npm run api:dev` | Run Vercel API locally |

---

## Building for Android

```bash
npx eas build --profile development --platform android
```

See `eas.json` for build profiles. Use the development build for testing Google Sign-In with your OAuth clients.

---

## License

Private — Miralab.
