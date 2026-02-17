# Tequila CRM

Mobile (iOS) and web app for tequila-company sales: **messaging** (channels + DMs) and **CRM analytics** (account trends, market share, opportunities). Data is ingested from Playwright bots that scrape industry reports.

## Repo layout

- **backend/** – Node.js + Express + PostgreSQL API (auth, health; messaging and ingest in later phases)
- **app/** – Expo (React Native) app for iOS and web
- **shared/** – Shared TypeScript types (API contracts)
- **docs/** – Architecture and handoff notes
- **ydrink_*** – Existing Python Playwright + transformer pipeline (unchanged until Phase 3)

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL (PostgreSQL), JWT_SECRET
npm install
npm run db:migrate
npm run dev
```

API: http://localhost:3000 (or `PORT` in .env)

### App (Expo)

```bash
cd app
npm install
npx expo start
```

- Web: open http://localhost:8081  
- iOS: Expo Go app or EAS Build → TestFlight

## Phases

- **Phase 0** – Foundation (this repo): backend auth + health, Expo scaffold
- **Phase 1** – Messaging (channels + DMs), test with 2 users on phones
- **Phase 2** – CRM discovery with owner
- **Phase 3–6** – Data pipeline, CRM backend, CRM app, polish and handoff

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture overview.

## Deploy backend to Railway

1. New Project → Add **PostgreSQL**, then **GitHub Repo** (this repo).
2. For the API service: **Settings** → **Root Directory** can stay empty (root `package.json` runs `backend` build/start).
3. **Variables:** `DATABASE_URL` (from PostgreSQL service), `JWT_SECRET`, `FRONTEND_URL`.
4. After deploy, run migrations: from your machine set `DATABASE_URL` to Railway’s Postgres URL, then `cd backend && npm run db:migrate`.
