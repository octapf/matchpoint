# Setup and run

## Prerequisites

- **Node.js** 18+ (CI uses 20)
- **npm** (or compatible client)
- **Expo tooling:** [Expo CLI](https://docs.expo.dev/get-started/installation/), [EAS CLI](https://docs.expo.dev/build/setup/) for device builds
- **Backend:** MongoDB Atlas; Vercel account for API deployment
- **OAuth:** Google Cloud project (Web + Android OAuth clients); Apple Developer for Sign in with Apple on iOS

---

## 1. Clone and install

```bash
git clone https://github.com/octapf/matchpoint.git
cd matchpoint
npm install
```

---

## 2. Environment (app)

Copy `.env.example` to `.env` and set at least:

| Variable | Role |
|----------|------|
| `EXPO_PUBLIC_API_URL` | Base URL of the Vercel API (no trailing slash) |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth **Web** client ID |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth **Android** client ID (recommended for Android sign-in) |
| `EXPO_PUBLIC_INVITE_BASE_URL` | Base URL used when sharing invite links (see [DOMAIN_SETUP.md](../DOMAIN_SETUP.md)) |

Details and **server-side** variables: [SECRETS.md](./SECRETS.md).

Restart Metro after changing `.env`.

---

## 3. Run the mobile app

```bash
npm run start
```

Then choose the platform from the terminal (e.g. `a` Android, `w` web).

Other scripts (see `package.json`):

| Script | Use |
|--------|-----|
| `npm run start:tunnel` | Metro with tunnel (useful on restrictive networks) |
| `npm run android` | `expo run:android` (native dev build) |
| `npm run ios` | `expo run:ios` |
| `npm run web` | Web bundler |
| `npm run api:dev` | Vercel dev server for `/api` locally |

**Physical device without EAS queue:** [CONNECT-DEVICE.md](../CONNECT-DEVICE.md).

---

## 4. Backend (Vercel API)

Deploy `api/` to Vercel and configure env vars in the dashboard. Step-by-step: [VERCEL_DEPLOY.md](../VERCEL_DEPLOY.md).  
MongoDB: [MONGODB_SETUP.md](../MONGODB_SETUP.md).

Local API:

```bash
npm run api:dev
```

Point `EXPO_PUBLIC_API_URL` at the URL Vercel prints (or your production URL).

---

## 5. Verify before pushing

Same checks as CI:

```bash
npm run verify
```

---

## 6. EAS builds (Android)

Profiles live in `eas.json`. Example:

```bash
npx eas build --profile development --platform android
```

Production builds bake `EXPO_PUBLIC_*` from `eas.json` `env` (see [SECRETS.md](./SECRETS.md)).  
Play submission: `eas.json` → `submit`; service account JSON path under `./credentials/` (gitignored).

---

## Expo vs API nuances

See [EXPO_AND_VERCEL.md](./EXPO_AND_VERCEL.md).
