-- CRM dialer (Twilio browser softphone)
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- One row per dial attempt, whether it came from a lead's Dial button, the
-- keypad, or the list dialer. lead_id is nullable on purpose: a number typed
-- into the keypad has no lead yet, and we still want the call logged.
--
-- The lead's touchpoint timeline still gets a 'call' entry per completed dial —
-- this table is the call METADATA (sid, duration, recording, cost, who dialled)
-- that the timeline can't hold.

create table if not exists public.crm_calls (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references public.crm_leads (id) on delete set null,
  -- Twilio identifiers. call_sid is the browser→Twilio leg; child_call_sid is
  -- the Twilio→lead leg created by <Dial> (the one that carries the duration).
  call_sid        text unique,
  child_call_sid  text,
  setter_email    text,                                  -- who placed it
  direction       text not null default 'outbound',
  from_number     text,                                  -- caller ID used
  to_number       text not null,
  status          text not null default 'initiated',      -- initiated|ringing|in-progress|completed|busy|no-answer|failed|canceled
  answered        boolean not null default false,
  duration_sec    integer not null default 0,
  recording_sid   text,
  recording_url   text,
  disposition     text,                                   -- setter's outcome for this dial
  notes           text,
  price           numeric,                                -- Twilio cost, filled on completion
  price_unit      text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists crm_calls_lead_idx    on public.crm_calls (lead_id);
create index if not exists crm_calls_setter_idx  on public.crm_calls (setter_email);
create index if not exists crm_calls_created_idx on public.crm_calls (created_at desc);
create index if not exists crm_calls_child_idx   on public.crm_calls (child_call_sid);
