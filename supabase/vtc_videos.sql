-- VTC production pipeline. Each row is one video moving through the DFY
-- checkpoints (Script Ready → Approved → Recorded → Uploaded → Editing →
-- Delivered). State lives here in Supabase; Airtable is never written to.
-- Run this once in the Supabase SQL editor.

create table if not exists vtc_videos (
  id            uuid primary key default gen_random_uuid(),
  client_email  text not null,
  title         text not null default 'Untitled video',
  script_url    text,           -- team posts the script (Google Doc etc.)
  script_note   text,           -- optional note from the team
  recording_url text,           -- client pastes a share link to their raw recording
  final_url     text,           -- team posts the delivered / published video
  progress      jsonb not null default '{}'::jsonb,  -- { "0": {done,at,by}, ... }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists vtc_videos_client_email_idx on vtc_videos (client_email);
