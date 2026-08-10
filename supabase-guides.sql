-- Section guides: one short Loom walkthrough per app section.
-- Admins set/clear the Loom link in the UI; members see a banner card with a
-- "Watch" button on that section. See lib/guides.ts for the section ids.

create table if not exists public.section_guides (
  section text primary key,
  loom_url text,
  title text,
  updated_at timestamptz not null default now()
);

alter table public.section_guides enable row level security;
