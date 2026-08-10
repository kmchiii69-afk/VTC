-- Dedup log for roadmap phase-completion Discord notifications: one row per
-- (client, phase) the team has already been pinged about, so re-checking a
-- completed phase never re-sends. Run once.
create table if not exists public.roadmap_phase_notifications (
  user_email text not null,
  phase_id   text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_email, phase_id)
);
alter table public.roadmap_phase_notifications enable row level security;
