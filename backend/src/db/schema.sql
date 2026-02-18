-- Phase 0: Users + Regions (auth). Channels/Messages added in Phase 1.
-- Run via: psql $DATABASE_URL -f src/db/schema.sql (or use migrate.ts)

-- Regions (placeholder for Phase 0; used by users.assigned_region_id)
CREATE TABLE IF NOT EXISTS regions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  sgws_region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users (auth + future role/region for CRM; status for admin approval)
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('rep', 'manager', 'admin')),
  status     TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'rejected')),
  assigned_region_id UUID REFERENCES regions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Phase 1: Messaging (iMessage-style: channels = group chats, DMs = 1:1)
-- Channels (group chats: producer group, account group, shipping group, etc.)
CREATE TABLE IF NOT EXISTS channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('producer_group', 'account_group', 'shipping_group', 'general')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);

-- Channel members
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

-- DM threads (1:1 conversations)
CREATE TABLE IF NOT EXISTS dm_threads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user1_id, user2_id),
  CHECK (user1_id < user2_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user1 ON dm_threads(user1_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user2 ON dm_threads(user2_id);

-- Messages (either in a channel or in a DM thread)
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel_id    UUID REFERENCES channels(id) ON DELETE CASCADE,
  dm_thread_id  UUID REFERENCES dm_threads(id) ON DELETE CASCADE,
  CHECK (
    (channel_id IS NOT NULL AND dm_thread_id IS NULL) OR
    (channel_id IS NULL AND dm_thread_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_dm_thread ON messages(dm_thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
