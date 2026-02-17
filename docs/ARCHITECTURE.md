# Architecture Overview

## Stack

- **Backend:** Node.js, Express, TypeScript, PostgreSQL (Railway)
- **App:** Expo (React Native) – iOS and web from one codebase
- **Real-time (Phase 1):** Socket.io for channels and DMs
- **Data ingest (Phase 3):** Local server receives bot output, POSTs to Railway API

## Backend layers

- **Routes** – HTTP only; validate input, call services, return JSON
- **Services** – Business logic (auth, channels, messages, etc.)
- **DB** – PostgreSQL via `pg`; migrations in `backend/src/db/schema.sql`

## Auth

- Register: `POST /api/auth/register` → user + JWT
- Login: `POST /api/auth/login` → user + JWT
- Protected routes: `Authorization: Bearer <token>`

## Data flow (after Phase 3)

1. Playwright bots + transformer run locally → `metrics_truth_*.csv`
2. Local ingest server reads CSV, POSTs to Railway `POST /api/ingest/metrics`
3. API upserts into PostgreSQL (Accounts, AccountMetrics)
4. App and web call API; messaging uses Socket.io

## Conventions

- Env in `.env`; never commit. `.env.example` documents variables.
- New features: new route + service; no giant files.
- Shared types in `shared/` for API contracts.
