-- Funnel event stream — generic granular event log for attribution + velocity
-- tracking across all funnels (ig, ads, vsl, future). Separate from the
-- per-funnel conversion tables (funnel_leads, vsl_applications) which store
-- one row per lead; this stores one row per EVENT (view, step, cta_click, etc.)
-- so we can compute multi-touch attribution and stage-to-stage timing.
-- Run once in the Supabase SQL editor. Safe to re-run (all idempotent).

create table if not exists public.funnel_events (
  id                uuid primary key default gen_random_uuid(),
  event             text not null,          -- e.g. 'view', 'form_step', 'optin', 'qualified', 'cta_click'
  funnel            text not null,          -- 'ig' | 'ads' | 'vsl' | etc.
  session_id        text not null,
  email             text,
  device            text,                   -- 'mobile' | 'desktop'
  referrer          text,
  pathname          text,
  landing_page      text,

  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,
  fbclid            text,
  gclid             text,
  ttclid            text,
  msclkid           text,

  -- Multi-touch attribution (first cookie-persisted touch vs. most recent)
  attr_first_source text,
  attr_first_medium text,
  attr_last_source  text,
  attr_last_medium  text,
  attr_touch_count  int,

  -- Stage velocity — timing from the previous stage and from funnel entry
  velocity_prev_stage    text,
  velocity_ms_from_prev  bigint,
  velocity_ms_from_entry bigint,

  -- Cross-funnel journey (comma-joined funnel names visited this session)
  journey_funnels   text,

  metadata          jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists funnel_events_event_idx      on public.funnel_events (event);
create index if not exists funnel_events_funnel_idx     on public.funnel_events (funnel);
create index if not exists funnel_events_session_idx    on public.funnel_events (session_id);
create index if not exists funnel_events_created_at_idx on public.funnel_events (created_at desc);
