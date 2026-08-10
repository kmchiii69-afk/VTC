-- Admin-editable roadmap step content. Lets admins override a roadmap item's
-- description text and resource links without a code change. Keyed by the
-- stable roadmap item_id (see lib/roadmap-data.ts). Run once.
create table if not exists public.roadmap_item_content (
  item_id     text primary key,
  description text,
  links       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.roadmap_item_content enable row level security;
