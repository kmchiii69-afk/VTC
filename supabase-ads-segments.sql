-- Ads-gate segment applications — one table per segment routed from the
-- /funnel/ads gate (revenue tier + running-ads branch), so each segment's
-- volume/conversion can be tracked independently.
-- Run once in the Supabase SQL editor. Safe to re-run (all idempotent).

do $$
declare
  t text;
begin
  foreach t in array array[
    'ads_under_100k_applications',
    'ads_over_100k_ads_applications',
    'ads_over_100k_noads_applications'
  ]
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id                    uuid primary key default gen_random_uuid(),
        email                 text not null unique,
        first_name            text,
        last_name             text,
        phone                 text,
        guests                text,
        instagram             text,
        business_description  text,
        current_revenue       text,
        target_revenue        text,
        blocker               text,
        commitment            text,
        investment_range      text,
        watched_youtube       text,
        decision_maker        text,
        qualified             boolean,
        source                text,
        utm_source            text,
        utm_medium            text,
        utm_campaign          text,
        utm_content           text,
        utm_term              text,
        fbclid                text,
        gclid                 text,
        ttclid                text,
        traffic_source        text,
        referrer              text,
        landing_page          text,
        submitted_at          timestamptz not null default now()
      );
      create index if not exists %1$I_email_idx        on public.%1$I (email);
      create index if not exists %1$I_submitted_at_idx  on public.%1$I (submitted_at desc);
      alter table public.%1$I enable row level security;
    $f$, t);
  end loop;
end $$;
