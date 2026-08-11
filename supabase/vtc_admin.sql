-- Owner settings (SLA overrides etc.) + per-client AM notes/to-dos.
-- Run once in the Supabase SQL editor.

create table if not exists vtc_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists vtc_notes (
  id           uuid primary key default gen_random_uuid(),
  client_email text not null,
  body         text not null,
  kind         text not null default 'note',   -- note | todo
  done         boolean not null default false,
  author       text,
  created_at   timestamptz not null default now()
);
create index if not exists vtc_notes_client_email_idx on vtc_notes (client_email);

-- Weekly CSM tracker (digitized Google sheet): one row per client per week.
create table if not exists vtc_weekly (
  client_email text not null,
  week_start   date not null,                 -- Monday of the week
  days         jsonb not null default '{}'::jsonb, -- { mon, tue, wed, thu, fri }
  posted       text,                           -- Posted? / reason
  updated_at   timestamptz not null default now(),
  primary key (client_email, week_start)
);
