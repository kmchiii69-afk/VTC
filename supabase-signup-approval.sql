-- Signup approval gate.
-- Adds a tri-state approval status to portal_users. Existing accounts default to
-- 'approved' so nobody is locked out; self-serve signups are created as 'pending'
-- and can only sign in once an admin approves them from the admin panel.
--
-- Login requires status = 'approved' AND active = true:
--   pending  -> active=true,  status='pending'  (correct password, login refused with "pending approval")
--   rejected -> active=false, status='rejected' (blocked; shows generic "Invalid credentials")

ALTER TABLE portal_users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- Backfill any pre-existing NULLs (defensive; the DEFAULT covers new-column rows).
UPDATE portal_users SET status = 'approved' WHERE status IS NULL;
