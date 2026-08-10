-- Adds a `meta jsonb` column to each bot's messages table so structured render
-- data (e.g. the content bot's SOP/module link buttons) is persisted with the
-- message. Without this, a returning user only gets the bare text on reload and
-- the link buttons disappear after they navigate away (open a module, etc.).
--
-- Run once in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).

alter table public.content_messages add column if not exists meta jsonb;
alter table public.advisor_messages add column if not exists meta jsonb;
alter table public.csm_messages     add column if not exists meta jsonb;
alter table public.salesbot_messages add column if not exists meta jsonb;
