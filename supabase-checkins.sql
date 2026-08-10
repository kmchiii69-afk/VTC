-- Fathom check-in integration tables
-- Run this once in the Supabase SQL editor (same project as `portal_users`).
-- Mirrors the existing manual-table convention (no migration framework in this repo).

-- ─── check_ins ──────────────────────────────────────────────────────────────
-- One row per (Fathom call × matched client). A group call with N clients
-- produces N rows that share the same fathom_recording_id.
create table if not exists public.check_ins (
  id                    uuid primary key default gen_random_uuid(),
  fathom_recording_id   text not null,
  title                 text,
  coach_email           text,
  coach_name            text,
  client_email          text,                 -- null until matched/assigned
  call_date             timestamptz,
  duration_minutes      integer,
  recording_url         text,
  transcript            text,                 -- raw transcript (admin-only)
  summary_bullets       jsonb default '[]'::jsonb,
  action_steps          jsonb default '[]'::jsonb,
  queries_answered      jsonb default '[]'::jsonb,
  wins                  jsonb default '[]'::jsonb,
  blockers              jsonb default '[]'::jsonb,
  red_flags             jsonb default '[]'::jsonb,   -- admin-only
  sentiment             text,
  roadmap_updates       jsonb default '[]'::jsonb,
  raw_payload           jsonb,                -- full webhook body for reprocessing
  status                text not null default 'pending',
                        -- 'pending' | 'processed' | 'unmatched_client' | 'error'
  created_at            timestamptz not null default now()
);

-- Dedupe key: at most one row per (recording, client). Allows multi-client
-- group calls while preventing duplicate webhook deliveries from doubling rows.
-- NOTE: a unique index treats NULLs as distinct, so unmatched rows (client_email
-- IS NULL) are de-duped explicitly in code via getCheckInByFathomId().
create unique index if not exists check_ins_recording_client_uniq
  on public.check_ins (fathom_recording_id, client_email);

create index if not exists check_ins_client_idx  on public.check_ins (client_email);
create index if not exists check_ins_coach_idx   on public.check_ins (coach_email);
create index if not exists check_ins_status_idx  on public.check_ins (status);

-- ─── client_progress ────────────────────────────────────────────────────────
-- One row per client (keyed by email). Holds the rolling, AI-maintained profile.
create table if not exists public.client_progress (
  client_email      text primary key,
  narrative         text default '',            -- client-safe, SooWei voice
  roadmap_state     jsonb default '{}'::jsonb,  -- { phase, completed[], blocked[] }
  open_action_items jsonb default '[]'::jsonb,
  wins              jsonb default '[]'::jsonb,
  momentum          text,                        -- sentiment trend
  admin_notes       text default '',             -- red flags / sensitive (ADMIN ONLY)
  updated_at        timestamptz not null default now()
);
