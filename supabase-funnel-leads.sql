-- Funnel leads table — short-form opt-ins from /funnel/ads and /funnel/ig
-- Run once in the Supabase SQL editor.  Safe to re-run (all idempotent).

create table if not exists public.funnel_leads (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text,
  phone           text,
  source          text,                  -- 'ads' | 'ig' | etc.
  business_type   text,
  current_revenue text,
  target_revenue  text,
  bottleneck      text,
  readiness       text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  gclid           text,
  ttclid          text,
  traffic_source  text,
  referrer        text,
  landing_page    text,
  created_at      timestamptz not null default now()
);

create index if not exists funnel_leads_email_idx      on public.funnel_leads (email);
create index if not exists funnel_leads_source_idx     on public.funnel_leads (source);
create index if not exists funnel_leads_created_at_idx on public.funnel_leads (created_at desc);
