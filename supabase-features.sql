-- Per-client portal feature gating.
-- Run once in the Supabase SQL editor (same project as portal_users).
--
-- Adds a `features` allowlist to each portal user. The column is nullable:
-- a null / empty list means the client falls back to the app default
-- (recordings only), so existing clients automatically drop to recordings-only
-- with no data migration. Admins always see every feature regardless.

alter table public.portal_users
  add column if not exists features text[];

-- Valid feature ids (must match PORTAL_FEATURES in lib/features.ts):
--   dashboard | roadmap | modules | sops | recordings
--
-- To unlock features for a client, set the array, e.g.:
--   update public.portal_users
--   set features = array['recordings','roadmap']
--   where email = 'client@example.com';
