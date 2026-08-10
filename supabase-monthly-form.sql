-- Monthly accountability form (one required submission per member per month).
-- Run once in the Supabase SQL editor (same project as portal_users / action_items).
--
-- A member (role 'user') is gated at the end of each month: on the last day of
-- month M they must report M's numbers before they can use the app, and the gate
-- persists on later logins until submitted. `period` is the reported month 'YYYY-MM'.

create table if not exists public.monthly_forms (
  id                uuid primary key default gen_random_uuid(),
  user_email        text not null,
  period            text not null,          -- 'YYYY-MM' month being reported
  cash_collected    numeric,                -- $ collected that month
  ig_reels_posted   integer,                -- total IG reels posted
  yt_videos_posted  integer,                -- total YT videos posted
  a_plus_problem    text,                   -- "What is your A+ problem right now?"
  submitted_at      timestamptz not null default now()
);

-- One submission per member per month (upsert target).
create unique index if not exists monthly_forms_email_period_uniq
  on public.monthly_forms (user_email, period);
create index if not exists monthly_forms_email_idx on public.monthly_forms (user_email);
