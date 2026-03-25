# Expo, Vercel, and deep links

## API base URL

The app reads **`EXPO_PUBLIC_API_URL`** (see `lib/config.ts`). It must be the **origin only** of your Vercel deployment, e.g. `https://your-project.vercel.app`, with **no** trailing slash.

- **Local dev:** `.env` → restart `npx expo start`.
- **EAS builds:** Values in `eas.json` under `build.<profile>.env` are baked into the binary at build time.

If the URL is wrong or empty, API calls fail with “API not configured” or network errors.

---

## Expo Go vs development / production build

| Mode | When to use |
|------|-------------|
| **Expo Go** | Quick UI checks; SDK version must match the Expo Go app from the store. Native modules may differ from your production app. |
| **Development build** (`expo-dev-client`, `eas build --profile development`) | Matches production native stack; **required** for reliable Google Sign-In testing with your OAuth clients and package name. |
| **Production / preview APK/AAB** | Store releases and serious QA. |

If the app “closes” or auth fails on Expo Go, try a **dev build** or align SDK with a [custom dev client](https://docs.expo.dev/develop/development-builds/introduction/).

---

## Google Sign-In

- **Web client ID** is used broadly (iOS scheme derivation in `app.config.js`, backend).
- **Android client ID** must match the **app signing certificate** (EAS or local keystore) and package `com.miralab.matchpoint` in Google Cloud Console.

SHA-1 / package mismatches cause Google sign-in to fail even when the rest of the app works.

---

## Invite links and web

Invite URLs are built from **`EXPO_PUBLIC_INVITE_BASE_URL`** + `/t/{token}`.  
Custom domain and asset links: [DOMAIN_SETUP.md](../DOMAIN_SETUP.md).  
Static web behavior and OG tags: `vercel.json`, `app/+html.tsx`.

---

## Running the API locally

```bash
npm run api:dev
```

Use the URL Vercel CLI prints as `EXPO_PUBLIC_API_URL` when testing against local serverless functions.

---

## Useful references

- [CONNECT-DEVICE.md](../CONNECT-DEVICE.md) — USB device, tunnel, `expo run:android`
- [VERCEL_DEPLOY.md](../VERCEL_DEPLOY.md) — production API
- [SETUP.md](./SETUP.md) — full setup
