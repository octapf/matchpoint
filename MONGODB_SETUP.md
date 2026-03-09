# MongoDB Atlas Setup for Matchpoint

Follow these steps to connect your Matchpoint app to MongoDB Atlas.

---

## 1. Create Database & Collections

You have **Cluster0** already. Now create the database and collections:

1. In Atlas, click **"Browse Collections"** (or **Database** → **Browse**)
2. Click **"Create Database"**
   - **Database name:** `matchpoint`
   - **Collection name:** `users` (create one at a time)
3. Create these 4 collections in the `matchpoint` database:
   - `users`
   - `tournaments`
   - `teams`
   - `entries`

*(Collections are created automatically when you insert the first document, or you can create them empty.)*

---

## 2. Get Connection String

1. In Atlas, click **"Connect"** on your cluster (Cluster0)
2. Choose **"Drivers"** → Copy the connection string
3. Replace `<password>` with your database user password
4. Add this as `MONGODB_URI` in your **Vercel** project (see VERCEL_DEPLOY.md)

---

## 3. Configure the App

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```

2. After deploying the API to Vercel, add your API URL to `.env`:
   ```
   EXPO_PUBLIC_API_URL=https://your-app.vercel.app
   ```

3. Restart Expo: `npx expo start --tunnel`

---

## 5. Region Note

Your plan uses **Barcelona/Spain**. In Atlas, choose a cluster region in **EU** (e.g. Frankfurt, Ireland) for lower latency.

---

## 6. Auth (Google & Apple) – Later

Social login requires:
- **Google:** Create OAuth credentials in Google Cloud Console
- **Apple:** Apple Developer account for Sign in with Apple

We'll set these up after the database is connected.
