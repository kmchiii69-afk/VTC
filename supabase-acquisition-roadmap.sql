-- Acquisition Roadmap: a global, admin-editable week-by-week checklist shown on
-- the Acquisition board, plus per-client tick progress.
-- Run once in the Supabase SQL editor (same project as portal_users).
-- Backs /api/acquisition/roadmap (lib/acquisition-roadmap.ts).

-- Shared roadmap DEFINITION (weeks / steps / resources). One row, id='default',
-- edited by acq-admins and read by every acquisition client.
create table if not exists public.acquisition_roadmap (
  id         text primary key default 'default',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Per-client tick progress (mirrors roadmap_progress, kept separate).
create table if not exists public.acquisition_roadmap_progress (
  user_email   text not null,
  item_id      text not null,
  completed_at timestamptz not null default now(),
  primary key (user_email, item_id)
);

create index if not exists acq_roadmap_progress_user_idx
  on public.acquisition_roadmap_progress (user_email);
