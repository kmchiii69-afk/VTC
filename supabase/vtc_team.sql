-- VTC team seats + per-client operational state. Run once in the Supabase SQL
-- editor. Airtable stays the master for client identity; this owns app state.

-- Internal seat for each portal user (null = client). Values:
-- am | strategist | lead_strategist | scriptwriter | qa | editor | editor_lead | ops | thumbnail
alter table portal_users add column if not exists team_role text;

-- Operational per-client state (pods, cadence, health). Master identity still
-- read from Airtable; this is the app's own layer.
create table if not exists vtc_clients (
  client_email         text primary key,
  account_manager_email text,            -- the AM / owner (pod)
  plan                 text,
  videos_per_week      int not null default 1,
  dfy                  boolean not null default true, -- DFY edits / DWY packaging-only
  fixed_upload_day     text,
  status               text not null default 'active', -- active | paused | churned | on_books
  health               text not null default 'healthy', -- healthy | at_risk | defcon (Pass 2)
  slack_channel_id     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists vtc_clients_am_idx on vtc_clients (account_manager_email);
