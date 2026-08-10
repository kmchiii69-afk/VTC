-- Admin-managed module catalog for /modules (categories + video modules).
-- The /modules page reads these; if the tables are empty they auto-seed from
-- DEFAULT_SECTIONS (lib/modules-data.ts) on first load. Until this runs, the
-- page falls back to the static defaults (read-only — admin edits won't save).
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).

create table if not exists public.module_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists module_sections_order_idx on public.module_sections (sort_order);

create table if not exists public.module_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.module_sections(id) on delete cascade,
  title text not null,
  embed_id text,                       -- Vidalytics embed id
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists module_items_section_idx on public.module_items (section_id, sort_order);

-- RLS on, no policies — service-role server access only (same as the other tables).
do $$ declare t text; begin
  foreach t in array array['module_sections','module_items'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
