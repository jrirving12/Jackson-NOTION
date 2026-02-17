# Tequila CRM API

Node.js + Express + PostgreSQL backend. Phase 0: auth (register/login + JWT) and health.

## Setup

1. Copy env and set values:
   ```bash
   cp .env.example .env
   # Edit .env: set DATABASE_URL (PostgreSQL), JWT_SECRET
   ```

2. Install and migrate:
   ```bash
   npm install
   npm run db:migrate
   ```

3. Run:
   ```bash
   npm run dev
   ```
   API: http://localhost:3000

## Endpoints

- `GET /` – service info
- `GET /api/health` – health check (DB connectivity)
- `POST /api/auth/register` – body: `{ "email", "password", "name" }` (optional: `role`: rep | manager | admin)
- `POST /api/auth/login` – body: `{ "email", "password" }` → `{ user, token }`

Use `Authorization: Bearer <token>` for protected routes (Phase 1+).
