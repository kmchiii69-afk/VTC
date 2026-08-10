-- Client journey event log — the per-client activity stream that powers the
-- CSM dashboard. Append-only: every meaningful interaction a client has in the
-- program is logged here as one row, so we can reconstruct their whole journey.
-- Run once in the Supabase SQL editor (same project as portal_users / check_ins).
--
-- Events are written from server code (lib/journey.ts -> logEvent). Sources:
--   call / checkin                 — Fathom 1-1, onboarding & check-in calls
--   action_item_created/completed  — tasks assigned and ticked off
--   roadmap_completed/uncompleted  — roadmap step progression
--   admin_note                     — admin notes / red flags edited for a client
--   referral                       — a referral the client sent in
--   login                          — portal sign-in
--   onboarding_started/completed   — onboarding wizard lifecycle
--   weekly_cash_submitted          — organic cash self-report (leaderboard)
--   weekly_report_submitted        — Creative Specialist weekly KPI report
--   sop_view / module_view /       — content engagement (deduped per window so a
--   recording_view / guide_view      single sitting isn't logged repeatedly)
--
-- ref_table + ref_id point back at the source row (e.g. check_ins / calls /
-- action_items) so the dashboard can deep-link. metadata holds anything extra.

create table if not exists public.client_events (
  id           uuid primary key default gen_random_uuid(),
  client_email text not null,
  event_type   text not null,
  title        text,                 -- short human label, e.g. "Watched module: Camera Presence"
  summary      text,                 -- optional longer description
  ref_table    text,                 -- source table name (check_ins, calls, action_items, ...)
  ref_id       text,                 -- id within ref_table
  metadata     jsonb,                -- arbitrary extra context
  occurred_at  timestamptz not null default now(),  -- when the interaction happened
  created_at   timestamptz not null default now()   -- when we logged it
);

-- Primary access pattern: a single client's timeline, newest first.
create index if not exists client_events_email_idx on public.client_events (client_email, occurred_at desc);
create index if not exists client_events_type_idx  on public.client_events (event_type);

-- Enable RLS to match the rest of the schema (service-role writes bypass it).
alter table public.client_events enable row level security;
