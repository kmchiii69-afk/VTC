-- Global portal settings (key/value). Currently stores the global default
-- feature allowlist for new + ungated members (key = 'default_features').
-- Per-member overrides still live in portal_users.features.

create table if not exists public.portal_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

alter table public.portal_settings enable row level security;
-- Access is server-side only (Supabase service key), so no public policies.
