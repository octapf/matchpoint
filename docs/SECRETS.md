# Secrets and configuration (no values here)

This file describes **what** each variable is for and **where** it is set. **Never commit** real passwords, JWT secrets, or private keys.

---

## Client (`EXPO_PUBLIC_*`)

Loaded at **build time** for the Expo app. Documented in `.env.example`.

| Variable | Typical location |
|----------|------------------|
| `EXPO_PUBLIC_API_URL` | Local: `.env`. EAS: `eas.json` → `build.*.env`. |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Same |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Same |
| `EXPO_PUBLIC_INVITE_BASE_URL` | Same (defaults in `lib/config.ts` if unset) |

**Rule:** Anything `EXPO_PUBLIC_` is embedded in the client bundle. Do not put private API keys there.

---

## Server (Vercel)

Set in **Vercel** → Project → **Settings** → **Environment Variables** (per environment: Production / Preview / Development).

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Atlas connection string; database name in code is `matchpoint` |
| `GOOGLE_CLIENT_ID` | Should match the **Web** client used in the app |
| `GOOGLE_ANDROID_CLIENT_ID` | Optional; Android token verification on backend |
| `APPLE_CLIENT_ID` | Sign in with Apple (bundle/service ID as configured in Apple Developer) |
| `APP_URL` | Public base URL for email links (verify, reset password) |
| `JWT_SECRET` | **Required in production** for email verification and password-reset tokens |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP (e.g. Zoho); if missing, email flows may skip sending |

See [VERCEL_DEPLOY.md](../VERCEL_DEPLOY.md) for deploy steps.

---

## Local-only files (gitignored)

| Path | Purpose |
|------|---------|
| `.env` | Your local `EXPO_PUBLIC_*` overrides |
| `credentials/*.json` | Google Play service account for `eas submit` (see `credentials/README.md`) |
| `*.p8`, keystores | Apple / Android signing (if stored locally) |

`eas.json` may reference `serviceAccountKeyPath` for submit; keep that JSON **out of git**.

---

## Rotating credentials

1. Rotate in Google Cloud / Apple / Atlas / Vercel as needed.  
2. Update Vercel env vars and rebuild the app if client IDs change.  
3. Update EAS env or `eas.json` for new `EXPO_PUBLIC_*` values, then new EAS build.

If you fork this repo for your own deployment, replace OAuth client IDs and API URL with **your** values; do not rely on committed defaults for production.
