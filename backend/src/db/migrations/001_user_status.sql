-- Add status column for admin approval (existing DBs that already have users table).
-- Default 'active' so existing users keep working. New signups get status 'pending_approval' from authService.register().
-- To create the first admin: UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending_approval', 'active', 'rejected'));
