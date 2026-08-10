-- Call recordings (mastermind call embeds shown in the portal AND the hub).
-- Run once in the Supabase SQL editor (same project as portal_users).
-- Admins paste an embed code (e.g. a Fathom <iframe>) + category + call date;
-- all members can view and play it inline. Safe to re-run (idempotent).

create table if not exists public.call_recordings (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,    -- content_mastermind | brand_architect | scripting_mastermind
  title       text,
  embed_code  text,             -- raw embed HTML (iframe); primary field going forward
  fathom_url  text,             -- legacy: plain share link (kept for old rows)
  summary_url text,             -- optional link to a summary document for the call
  call_date   date,             -- date the call happened (sorted by this)
  created_at  timestamptz not null default now()
);

-- Migration for tables created before embed codes existed:
alter table public.call_recordings add column if not exists embed_code text;
alter table public.call_recordings add column if not exists summary_url text;
-- fathom_url used to be NOT NULL; recordings are embed-based now, so relax it.
alter table public.call_recordings alter column fathom_url drop not null;

-- Manual ordering: admins drag-and-drop recordings to set the order within a
-- category (and drag onto another category's tab to move it). Rows without a
-- sort_order (legacy / not-yet-reordered) fall back to newest-call-date-first.
alter table public.call_recordings add column if not exists sort_order integer;

create index if not exists call_recordings_cat_idx   on public.call_recordings (category);
create index if not exists call_recordings_date_idx  on public.call_recordings (call_date);
create index if not exists call_recordings_order_idx on public.call_recordings (category, sort_order);

alter table public.call_recordings enable row level security;
