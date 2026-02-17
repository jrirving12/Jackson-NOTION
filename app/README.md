# Tequila CRM App (Expo)

React Native (Expo) app for iOS and web. Phase 1: auth + iMessage-style messaging.

## Run in Chrome (web) first

1. **Point the app at your Railway API**
   ```bash
   cd app
   cp .env.example .env
   ```
   Edit `.env` if needed: `EXPO_PUBLIC_API_URL=https://linds-production-2547.up.railway.app` (no trailing slash).

2. **Install and start web**
   ```bash
   npm install
   npm run web
   ```

3. **Open Chrome** to the URL Expo prints (usually **http://localhost:8081**). Sign in with the same email/password you used in the API (e.g. `test@example.com` / `password123`).

**If login fails from Chrome:** In Railway, set the API service variable `FRONTEND_URL=http://localhost:8081` so CORS allows your browser. Redeploy if needed.

## Run locally (dev)

- **Web:** `npm run web` or `npm run dev` then press `w` → http://localhost:8081  
- **iOS:** `npm run dev` then press `i` or scan QR with Expo Go  
- **Android:** `npm run dev` then press `a` or scan QR  

(In production/Railway, `npm start` serves the static build from `dist/`; locally use `npm run dev` or `npm run web` for the dev server.)

Set `EXPO_PUBLIC_API_URL` in `.env` to your backend (Railway URL for deployed API, or `http://localhost:3000` for local backend).

## Build for TestFlight (Phase 1+)

```bash
npx eas build --platform ios --profile preview
```

Requires EAS account and `eas.json` config.
