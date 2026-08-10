-- Onboarding 2-day reminder cadence log. Run once in the Supabase SQL editor
-- (same project as portal_users / onboarding_progress).
--
-- A client still in onboarding (portal_users.onboarded_at IS NULL) is nudged in
-- their 1-1 Discord channel when they've been sitting on the SAME onboarding step
-- for more than 2 days. Cadence is "once, then daily": the first ping fires when
-- the step crosses the 2-day mark, then at most one ping per day until they
-- complete it. This table records, per (client, step), when we first pinged, when
-- we last pinged, and how many times — so the daily cron never double-sends in a
-- single day and never re-pings a step the client has moved past.
--
-- Mirrors the manual-DDL convention in this repo (no migration framework).

create table if not exists public.onboarding_reminders (
  user_email    text not null,
  step_id       text not null,
  first_sent_at timestamptz not null default now(),
  last_sent_at  timestamptz not null default now(),
  sent_count    integer     not null default 1,
  primary key (user_email, step_id)
);

create index if not exists onboarding_reminders_user_idx on public.onboarding_reminders (user_email);
alter table public.onboarding_reminders enable row level security;
