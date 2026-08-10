-- Funnel applicants + booking tracking. Run in the Supabase SQL editor. Idempotent.
--
--   1. Adds completed / last_step / booked_at / scheduled_at to every funnel
--      application table so we can capture PARTIAL applications (drop-offs) and
--      mark who booked a call (matched from Calendly by email).
--   2. Seeds two CRM pipelines: "VSL Pipeline" (books from /funnel/vsl) and
--      "Ads Pipeline" (books from the ads funnels; tagged by segment).

-- ── 1. Application-table columns ──────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'vsl_applications',
    'ads_under_100k_applications',
    'ads_over_100k_ads_applications',
    'ads_over_100k_noads_applications'
  ] loop
    execute format('alter table %I add column if not exists completed    boolean not null default false', t);
    execute format('alter table %I add column if not exists last_step     integer', t);
    execute format('alter table %I add column if not exists booked_at     timestamptz', t);
    execute format('alter table %I add column if not exists scheduled_at  timestamptz', t);
    -- email must be unique for the per-step upsert to work (usually already is).
    execute format('create unique index if not exists %I on %I (email)', t || '_email_uniq', t);
  end loop;
end $$;

-- ── 2. Seed booking pipelines ─────────────────────────────────────────────
insert into crm_pipelines (name, position, stages)
select 'VSL Pipeline', 2, '[
  {"key":"booked",      "label":"Booked",      "color":"#C9A8FF"},
  {"key":"showed",      "label":"Showed",      "color":"#34d399"},
  {"key":"closed_won",  "label":"Closed Won",  "color":"#4ade80"},
  {"key":"no_show",     "label":"No Show",     "color":"rgba(240,232,212,0.4)"},
  {"key":"closed_lost", "label":"Closed Lost", "color":"rgba(239,68,68,0.7)"}
]'::jsonb
where not exists (select 1 from crm_pipelines where name = 'VSL Pipeline');

insert into crm_pipelines (name, position, stages)
select 'Ads Pipeline', 3, '[
  {"key":"booked",      "label":"Booked",      "color":"#C9A8FF"},
  {"key":"showed",      "label":"Showed",      "color":"#34d399"},
  {"key":"closed_won",  "label":"Closed Won",  "color":"#4ade80"},
  {"key":"no_show",     "label":"No Show",     "color":"rgba(240,232,212,0.4)"},
  {"key":"closed_lost", "label":"Closed Lost", "color":"rgba(239,68,68,0.7)"}
]'::jsonb
where not exists (select 1 from crm_pipelines where name = 'Ads Pipeline');
