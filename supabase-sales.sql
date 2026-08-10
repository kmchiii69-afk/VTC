-- Sales pipeline tables (calls / icp_reports / icp_criteria)
-- Run once in the Supabase SQL editor (same project as portal_users).
--
-- These were originally created outside the repo (hand-deployed). This file
-- reconstructs the schema from how the app code reads/writes them, so any
-- Supabase project the app points at can be provisioned consistently.
-- Safe to re-run: every statement is `if not exists` and won't touch existing data.

-- ── calls ─────────────────────────────────────────────────────────────────────
-- One row per sales/closing call (Fathom sync, sales webhook, or manual import).
create table if not exists public.calls (
  id                 uuid primary key default gen_random_uuid(),
  fathom_call_id     text,                       -- dedupe key for synced/webhook calls
  lead_name          text,
  closer             text,
  setter             text,
  call_date          timestamptz,
  outcome            text,                       -- closed | no_close | dq | no_show | unknown
  product            text,
  cash_collected     numeric default 0,
  revenue            numeric default 0,
  call_notes_text    text,
  what_made_them_buy text,
  next_steps         text,
  transcript         text,
  summary            text,
  status             text not null default 'pending',  -- pending | imported | analyzed
  source             text,                       -- manual | fathom | sales_manager
  call_type          text,                       -- 'closing'
  raw_payload        jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists calls_fathom_id_idx on public.calls (fathom_call_id);
create index if not exists calls_source_idx     on public.calls (source);

-- ── icp_reports ───────────────────────────────────────────────────────────────
-- One AI analysis per call. The call_id FK is REQUIRED — PostgREST uses it to
-- embed `calls(...)` in /api/reports and /api/advisor.
create table if not exists public.icp_reports (
  id               uuid primary key default gen_random_uuid(),
  call_id          uuid references public.calls (id) on delete cascade,
  icp_score        integer,
  close_likelihood integer,
  pain_points      jsonb default '[]'::jsonb,
  call_summary     text,
  next_step        text,
  full_analysis    jsonb,
  analysis_type    text,                          -- 'closing'
  discord_sent     boolean default false,
  feedback_applied boolean default false,
  user_feedback    text,
  created_at       timestamptz not null default now()
);
create index if not exists icp_reports_call_idx on public.icp_reports (call_id);

-- ── icp_criteria ──────────────────────────────────────────────────────────────
-- Versioned ICP definition; the analysis reads the highest version (falls back
-- to a built-in default if the table is empty).
create table if not exists public.icp_criteria (
  id          uuid primary key default gen_random_uuid(),
  criteria    jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  created_at  timestamptz not null default now()
);
