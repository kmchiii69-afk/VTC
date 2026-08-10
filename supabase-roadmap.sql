-- Roadmap progress (per-client checkbox completion)
-- Run once in the Supabase SQL editor (same project as portal_users).
-- Backs /api/progress/roadmap (getRoadmapProgress / setRoadmapItem in lib/kv.ts).

create table if not exists public.roadmap_progress (
  user_email   text not null,
  item_id      text not null,
  completed_at timestamptz not null default now(),
  primary key (user_email, item_id)
);

create index if not exists roadmap_progress_user_idx on public.roadmap_progress (user_email);
