-- Per-client module completion (portal Modules tab). Mirrors roadmap_progress.
-- Run once. Until this exists, the portal still works but completions don't persist.
create table if not exists public.module_progress (
  user_email   text not null,
  module_id    text not null,
  completed_at timestamptz not null default now(),
  primary key (user_email, module_id)
);
create index if not exists module_progress_user_idx on public.module_progress (user_email);
alter table public.module_progress enable row level security;
