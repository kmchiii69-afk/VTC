-- VTC production pipeline. One row per video moving through the stage machine
-- (ideas → script assigned → [interview] → scripting → record → footage QA →
-- editing/packaging → client review → revisions → published). Stage state lives
-- in `progress` keyed by stage name. Airtable is never written to.
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists vtc_videos (
  id            uuid primary key default gen_random_uuid(),
  client_email  text not null,
  title         text not null default 'Untitled video',
  script_type   text not null default 'outline',  -- outline | full | interview
  dfy           boolean not null default true,     -- true = we edit (DFY); false = packaging-only (DWY)
  script_url    text,
  script_note   text,
  recording_url text,
  final_url     text,
  versions      jsonb not null default '{}'::jsonb, -- { "V1": url, "CRV1": url }
  assignees     jsonb not null default '{}'::jsonb, -- { "editor": email, "scriptwriter": email }
  status_note   text,
  thumbnail_stage text,                             -- concept | design | approved
  progress      jsonb not null default '{}'::jsonb, -- { "scripting": {done,at,by} }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists vtc_videos_client_email_idx on vtc_videos (client_email);

-- If the table already existed from the earlier 6-checkpoint version, add the
-- new columns (no-ops when they already exist):
alter table vtc_videos add column if not exists script_type text not null default 'outline';
alter table vtc_videos add column if not exists dfy boolean not null default true;
alter table vtc_videos add column if not exists versions jsonb not null default '{}'::jsonb;
alter table vtc_videos add column if not exists assignees jsonb not null default '{}'::jsonb;
alter table vtc_videos add column if not exists status_note text;
alter table vtc_videos add column if not exists thumbnail_stage text;
