-- Onboarding wizard storage. Run once in the Supabase SQL editor (same project
-- as portal_users). Two pieces:
--
--   portal_users.onboarded_at  — JS-epoch ms set when a client finishes the
--                                 onboarding flow. NULL = still onboarding.
--                                 Drives the new-client login gate.
--   onboarding_progress        — one row per (client, completed step). Mirrors
--                                 the roadmap_progress design; the wizard reads
--                                 this to know which steps are done.

alter table public.portal_users add column if not exists onboarded_at bigint;

-- Which Brand Architect contract the client selected/signed during onboarding
-- ('14k' | '25k'). Set when they pick a contract in the "Select & Sign" step.
alter table public.portal_users add column if not exists contract_tier text;

-- Backfill: existing clients should NOT be forced through onboarding. Mark every
-- current user as already onboarded. New users created after this runs have
-- onboarded_at = NULL (createUser doesn't set it), so only THEY hit the wizard.
update public.portal_users
  set onboarded_at = (extract(epoch from now()) * 1000)::bigint
  where onboarded_at is null;

create table if not exists public.onboarding_progress (
  user_email   text not null,
  step_id      text not null,
  completed_at timestamptz not null default now(),
  primary key (user_email, step_id)
);
create index if not exists onboarding_progress_user_idx on public.onboarding_progress (user_email);

alter table public.onboarding_progress enable row level security;

-- Files a client uploads during onboarding (e.g. their completed docs PDFs for
-- the "Submit for approval" step). Many rows per (client, step) — a step can
-- accept multiple files. Files live in the public 'onboarding-docs' bucket.
create table if not exists public.onboarding_uploads (
  id         uuid primary key default gen_random_uuid(),
  user_email text not null,
  step_id    text not null,
  file_url   text not null,
  file_name  text,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_uploads_user_step_idx on public.onboarding_uploads (user_email, step_id);
alter table public.onboarding_uploads enable row level security;

-- Migration for an EARLIER install where the table had a (user_email, step_id)
-- primary key (one file per step). Switches it to an id PK so multiple files
-- per step are allowed. Safe to run repeatedly.
alter table public.onboarding_uploads add column if not exists id uuid default gen_random_uuid();
alter table public.onboarding_uploads drop constraint if exists onboarding_uploads_pkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'onboarding_uploads_pkey') then
    alter table public.onboarding_uploads add primary key (id);
  end if;
end $$;
