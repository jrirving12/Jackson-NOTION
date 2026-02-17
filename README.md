# Tequila CRM

Mobile (iOS) and web app for tequila-company sales: **messaging** (channels + DMs) and **CRM analytics** (account trends, market share, opportunities). Data is ingested from Playwright bots that scrape industry reports.

**Everything is in the linds GitHub repo.** Railway pulls from linds for both the API and the web app. No need to run anything locally for production—push to linds and both deploy from there.

## Repo layout

- **backend/** – Node.js + Express + PostgreSQL API (auth, health, messaging)
- **app/** – Expo (React Native) app for iOS and web
- **shared/** – Shared TypeScript types (API contracts)
- **docs/** – Architecture and deploy notes
- **ydrink_*** – Existing Python Playwright + transformer pipeline (Phase 3+)

## Deploy from linds (Railway)

1. **API service** – From repo root: build/start run the backend (see [docs/DEPLOY.md](docs/DEPLOY.md)).
2. **Web app service** – From **app/** folder: build with `npm run build:web`, serve with `npm run serve:web`. Set `EXPO_PUBLIC_API_URL` to your API URL. Generate a domain; then set the API’s `FRONTEND_URL` to that web URL.

Open the **web app** URL in Chrome to use the app; no local `npm run web` required.

See [docs/DEPLOY.md](docs/DEPLOY.md) for step-by-step Railway setup (both services from the linds repo).

## Local dev (optional)

- **Backend:** `cd backend && cp .env.example .env && npm install && npm run db:migrate && npm run dev`
- **App (web):** `cd app && npm install && npm run web` → http://localhost:8081 (set `EXPO_PUBLIC_API_URL` in app `.env` to API URL)

## Phases

- **Phase 0** – Foundation: backend auth + health, Expo scaffold
- **Phase 1** – Messaging (channels + DMs), iMessage-style
- **Phase 2** – CRM discovery with owner
- **Phase 3–6** – Data pipeline, CRM backend, CRM app, polish and handoff

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture overview.
