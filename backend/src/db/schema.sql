-- Phase 0: Users + Regions (auth). Channels/Messages added in Phase 1.
-- Run via: psql $DATABASE_URL -f src/db/schema.sql (or use migrate.ts)

-- Regions (placeholder for Phase 0; used by users.assigned_region_id)
CREATE TABLE IF NOT EXISTS regions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  sgws_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users (auth + future role/region for CRM)
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('rep', 'manager', 'admin')),
  assigned_region_id UUID REFERENCES regions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
