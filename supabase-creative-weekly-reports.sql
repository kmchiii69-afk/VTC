-- Creative Specialist weekly reports. Run in the Supabase SQL editor (same
-- project as portal_users). Safe to re-run, and safe if you already ran an
-- earlier version of this file — the ALTERs below bring it up to date.
--
-- TWO reports per (member, Mon-Sun week), told apart by `kind`:
--   'wednesday' — the mid-week plan: an implementation box against each to-do
--                 assigned that week, plus the steps they'll take to finish them
--   'friday'    — the week's results: Sales, Content (Instagram/YouTube) and
--                 Commitment
--
-- `answers` is a jsonb map of field id → value for whichever kind it is; see
-- lib/creative-weekly-report.ts. Repeating groups (top reels, the reel/video
-- pipelines) are arrays of row objects under their group id. `implementations`
-- and `missed_reasons` are maps of to-do id → text.
--
-- The to-do data itself is NOT stored here — both reports read live off
-- client_todos (items whose assigned_date falls inside the week), so the lists
-- always match the member's actual to-dos.
--
-- Timestamps: submitted_at (the member submitted), sent_at (it went to the founder).

create table if not exists public.creative_weekly_reports (
  id           uuid primary key default gen_random_uuid(),
  user_email   text not null,
  week_start   date not null,                       -- Monday of the reported week
  kind         text not null default 'friday',      -- 'wednesday' | 'friday'
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Upgrade path: adds `kind` if the table predates the Wednesday report. Existing
-- rows become 'friday', which is what they are.
alter table public.creative_weekly_reports
  add column if not exists kind text not null default 'friday';

-- One report per (member, week, kind) — the upsert target. The old two-column
-- unique index has to go, or a member could only ever have one report per week.
drop index if exists public.creative_weekly_reports_user_week_uniq;
create unique index if not exists creative_weekly_reports_user_week_kind_uniq
  on public.creative_weekly_reports (user_email, week_start, kind);
create index if not exists creative_weekly_reports_user_idx
  on public.creative_weekly_reports (user_email, week_start desc);

alter table public.creative_weekly_reports enable row level security;

-- ── creative_weekly_report_prompts ───────────────────────────────────────────
-- Dedup log for the "submit your report" pings (Wednesday and Friday), so a cron
-- retry or a redeploy never double-pings the same member for the same report.
create table if not exists public.creative_weekly_report_prompts (
  user_email text not null,
  week_start date not null,
  kind       text not null default 'friday',
  sent_at    timestamptz not null default now(),
  primary key (user_email, week_start, kind)
);

-- Upgrade path for a prompts table created before `kind` existed: add the column,
-- then widen the two-column primary key to include it.
alter table public.creative_weekly_report_prompts
  add column if not exists kind text not null default 'friday';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.creative_weekly_report_prompts'::regclass
      and contype = 'p'
      and array_length(conkey, 1) = 2
  ) then
    alter table public.creative_weekly_report_prompts
      drop constraint creative_weekly_report_prompts_pkey;
    alter table public.creative_weekly_report_prompts
      add primary key (user_email, week_start, kind);
  end if;
end $$;

alter table public.creative_weekly_report_prompts enable row level security;

-- ── optional cleanup, only if you ran the very first version of this file ────
-- alter table public.creative_weekly_reports drop column if exists status;
-- alter table public.creative_weekly_reports drop column if exists reviewed_at;
