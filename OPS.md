# Team messenger — runbook

Expo client + Node/Socket.IO API (formerly Jackson-NOTION).

## Backend API

```bash
cd apps/team-messenger/backend
npm install
# Set DATABASE_URL, JWT_SECRET (required in production), PORT, FRONTEND_URL, NODE_ENV
npm run dev   # or start script from package.json
```

Default port from [`backend/src/config.ts`](backend/src/config.ts): **3000**. CORS allows all origins in development.

## Expo (Expo Go on a phone)

```bash
cd apps/team-messenger/app
npm install
npx expo start
```

Point the app at your machine’s API:

- Set **`EXPO_PUBLIC_API_URL`** in `app/.env` or your shell to the backend URL reachable from the phone (e.g. `http://192.168.1.x:3000`). Same variable is read in [`app/constants/Config.ts`](app/constants/Config.ts).

## CRM integration (Twenty)

Twenty and this messenger are **separate apps** for now:

1. Run both services on known hosts.
2. In Twenty, give users a **bookmark** or internal doc with the messenger URL until a CRM nav link is added.
3. Optional later: shared auth (same emails in both systems; JWT or OAuth) — design separately.

Repo root [`.env.example`](../../.env.example) lists `EXPO_PUBLIC_API_URL` for discoverability.
