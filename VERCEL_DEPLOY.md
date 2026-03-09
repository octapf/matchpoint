# Deploy Matchpoint API to Vercel

The backend runs as serverless functions on Vercel, connecting to MongoDB Atlas.

---

## 1. Prerequisites

- Vercel account (vercel.com)
- MongoDB Atlas connection string
- Git repo (optional; you can deploy via CLI)

---

## 2. Deploy

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts. Link to an existing project or create a new one.

### Option B: Git integration

1. Push your repo to GitHub/GitLab/Bitbucket
2. Go to vercel.com → Add New Project → Import your repo
3. Vercel auto-detects the setup; no build command needed for API-only

---

## 3. Environment variables

In **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**:

| Name         | Value                                                                 |
|--------------|-----------------------------------------------------------------------|
| `MONGODB_URI`| `<redacted-mongodb-uri> |

Use your Atlas connection string. Replace `<password>` with the real password.

---

## 4. App configuration

After deploy, copy your Vercel URL (e.g. `https://matchpoint-xxx.vercel.app`).

In your app `.env`:

```
EXPO_PUBLIC_API_URL=https://matchpoint-xxx.vercel.app
```

Restart Expo: `npx expo start --tunnel`

---

## 5. API endpoints

| Method | Path                    | Description              |
|--------|-------------------------|--------------------------|
| GET    | /api/tournaments        | List tournaments         |
| GET    | /api/tournaments/:id    | Get one tournament       |
| POST   | /api/tournaments        | Create tournament        |
| PATCH  | /api/tournaments/:id    | Update tournament        |
| DELETE | /api/tournaments/:id    | Delete tournament        |
| GET    | /api/entries            | List entries             |
| GET    | /api/entries/:id        | Get one entry            |
| POST   | /api/entries            | Create entry             |
| PATCH  | /api/entries/:id        | Update entry             |
| DELETE | /api/entries/:id        | Delete entry             |
| GET    | /api/teams              | List teams               |
| GET    | /api/teams/:id          | Get one team             |
| POST   | /api/teams              | Create team              |
| PATCH  | /api/teams/:id          | Update team              |
| DELETE | /api/teams/:id          | Delete team              |
| GET    | /api/users?id= or ?email=| Get user by id or email  |
| POST   | /api/users              | Create/find user         |
| PATCH  | /api/users?id=          | Update user              |

---

## 6. Local development

To test the API locally:

```bash
vercel dev
```

This runs the serverless functions locally. Set `MONGODB_URI` in `.env` (or `.env.local`) for local runs. The app can point `EXPO_PUBLIC_API_URL` to `http://localhost:3000` when using `vercel dev`.
