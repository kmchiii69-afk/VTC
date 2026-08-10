-- Cached AI journey summary per client (admin CSM dashboard). One row per client;
-- regenerated on demand. Run once.
create table if not exists public.client_summaries (
  client_email text primary key,
  summary      text not null,
  generated_at timestamptz not null default now()
);
alter table public.client_summaries enable row level security;
