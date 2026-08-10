-- Weekly organic cash-collected self-reports + the leaderboard they power.
-- Run once in the Supabase SQL editor (same project as portal_users).
--
-- Every Monday AM a cron posts a prompt in each member's 1-1 Discord channel
-- linking to /weekly-cash, where they report LAST week's (Mon-Sun) cash collected
-- from ORGANIC content, with attributed proof. Those submissions feed the
-- leaderboard bubble (client name + cash), which shows a collective sum for the
-- current month and rolls over at 00:00 UTC on the 2nd of each month.

-- ── weekly_cash ───────────────────────────────────────────────────────────────
-- One self-reported row per (member, reported week). week_start is the Monday of
-- the reported Mon-Sun week. Re-submitting the same week upserts (overwrites).
create table if not exists public.weekly_cash (
  id             uuid primary key default gen_random_uuid(),
  user_email     text not null,
  week_start     date not null,                 -- Monday of the reported week
  cash_collected numeric not null default 0,    -- $ collected from organic that week
  proof_url      text,                          -- public URL of the uploaded proof image
  proof_name     text,
  note           text,                          -- optional context ("what drove it")
  submitted_at   timestamptz not null default now()
);

-- One submission per member per week (upsert target).
create unique index if not exists weekly_cash_user_week_uniq
  on public.weekly_cash (user_email, week_start);
create index if not exists weekly_cash_user_idx on public.weekly_cash (user_email);
-- The leaderboard windows by submitted_at (see lib/weekly-cash.ts), so index it.
create index if not exists weekly_cash_submitted_idx on public.weekly_cash (submitted_at);

alter table public.weekly_cash enable row level security;

-- ── weekly_cash_prompts ───────────────────────────────────────────────────────
-- Dedup log: one row per (member, week) the Monday prompt was posted, so a re-run
-- of the cron (retry, redeploy) never double-pings the same client for the same
-- week. week_start is the Monday of the week being requested (the prior week).
create table if not exists public.weekly_cash_prompts (
  user_email text not null,
  week_start date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_email, week_start)
);
alter table public.weekly_cash_prompts enable row level security;
