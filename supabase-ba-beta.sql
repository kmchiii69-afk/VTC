-- Brand Architect Beta — an ADMIN-ONLY sandbox catalog inside /modules.
-- Mirrors the live module catalog (categories → lessons with a Vidalytics embed)
-- but each lesson can also carry "resource" pills that open in a popup:
--   kind 'link' → opens the url in an iframe (a doc/sheet/Loom/PDF link)
--   kind 'note' → renders the markdown body in-app
-- Nothing here is ever shown to members — the /modules page only loads it for
-- admins. Safe to run on a fresh DB; degrades to an empty catalog until run.
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).

create table if not exists public.ba_beta_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ba_beta_categories_order_idx on public.ba_beta_categories (sort_order);

create table if not exists public.ba_beta_lessons (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ba_beta_categories(id) on delete cascade,
  title text not null,
  embed_id text,                       -- Vidalytics embed id
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ba_beta_lessons_cat_idx on public.ba_beta_lessons (category_id, sort_order);

create table if not exists public.ba_beta_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.ba_beta_lessons(id) on delete cascade,
  title text not null,
  kind text not null default 'link',   -- 'link' (iframe a url) | 'note' (markdown body)
  url text not null default '',
  body text not null default '',
  inline boolean not null default false,  -- true = embed below the video; false = popup pill
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ba_beta_resources_lesson_idx on public.ba_beta_resources (lesson_id, sort_order);

-- Migration for tables created before inline attachments existed:
alter table public.ba_beta_resources add column if not exists inline boolean not null default false;

-- RLS on, no policies — service-role server access only (same as the other tables).
do $$ declare t text; begin
  foreach t in array array['ba_beta_categories','ba_beta_lessons','ba_beta_resources'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
