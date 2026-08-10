-- Align portal_users with the fields the admin member panel edits.
-- These columns were referenced by the app (lib/kv.ts User type) but never
-- existed in the table, so saving discord channel / dates / revenue / tags
-- silently failed. Run once in the Supabase SQL editor.
--
-- Date fields store JS millisecond timestamps (Date.now()), hence bigint.

alter table public.portal_users
  add column if not exists discord_channel_id text,
  add column if not exists start_date         bigint,
  add column if not exists last_call_date      bigint,
  add column if not exists contract_end_date   bigint,
  add column if not exists revenue_goal        numeric,
  add column if not exists revenue_current     numeric,
  add column if not exists tags                text[];
