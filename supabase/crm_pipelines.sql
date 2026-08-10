-- CRM Pipelines + Tags + Email + ig_handle unique fix
-- Run this in the Supabase SQL editor. Idempotent — safe to run more than once.
--
-- What it does:
--   1. Adds a crm_pipelines table (named pipelines, each with an ordered list
--      of custom stages).
--   2. Adds email, tags[], and pipeline_id columns to crm_leads.
--   3. Adds the UNIQUE index on ig_handle that the opt-in / application upserts
--      (onConflict: 'ig_handle') have always needed — without it those upserts
--      silently error, which is why freebie opt-ins never reached the CRM.
--   4. Seeds two pipelines: the existing "Sales Pipeline" (and backfills every
--      current lead onto it) and a new "Freebie Leads" pipeline.

-- ── 1. Pipelines ──────────────────────────────────────────────────────────
create table if not exists crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- ordered array of { "key": text, "label": text, "color": text }
  stages     jsonb not null default '[]'::jsonb,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared updated_at trigger fn (already exists if crm_leads was set up; created
-- here too so this script is self-contained).
create or replace function update_crm_leads_updated_at()
  returns trigger as $$
  begin new.updated_at = now(); return new; end;
  $$ language plpgsql;

drop trigger if exists set_crm_pipelines_updated_at on crm_pipelines;
create trigger set_crm_pipelines_updated_at
  before update on crm_pipelines
  for each row execute function update_crm_leads_updated_at();

-- ── 2. New columns on crm_leads ───────────────────────────────────────────
-- Make sure 'freebie' is an allowed source (opt-ins + CSV import use it).
alter table crm_leads drop constraint if exists crm_leads_source_check;
alter table crm_leads add constraint crm_leads_source_check
  check (source in ('ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'freebie', 'other'));

-- Stages are now per-pipeline (custom names), so the old fixed stage CHECK
-- (sales-only keys) must go — otherwise opt_ins / qualified / any custom stage
-- is rejected on insert. Validation now lives in each pipeline's stage list.
alter table crm_leads drop constraint if exists crm_leads_stage_check;

alter table crm_leads add column if not exists email       text;
alter table crm_leads add column if not exists makes_money text;   -- 'Yes' / 'No' — makes money from content
alter table crm_leads add column if not exists tags        text[] not null default '{}';
alter table crm_leads add column if not exists pipeline_id uuid references crm_pipelines(id) on delete set null;

create index if not exists crm_leads_pipeline_idx on crm_leads(pipeline_id);
create index if not exists crm_leads_tags_idx     on crm_leads using gin(tags);

-- ── 3. Unique ig_handle (arbiter for the onConflict upserts) ──────────────
-- Plain (non-partial) unique index: Postgres keeps NULLs distinct, so leads
-- with no IG handle are unaffected, and a plain index CAN be used as the
-- ON CONFLICT (ig_handle) arbiter (a partial index cannot, via supabase-js).
-- Wrapped so a pre-existing duplicate handle doesn't abort the whole script.
do $$
begin
  create unique index if not exists crm_leads_ig_handle_uniq on crm_leads(ig_handle);
exception when others then
  raise notice 'Skipped crm_leads_ig_handle_uniq: %. Dedupe duplicate ig_handle rows, then re-run just this index.', sqlerrm;
end $$;

-- ── 4. Seed pipelines ─────────────────────────────────────────────────────
-- Sales Pipeline: the stages the app has always used (keys match the values
-- already stored in crm_leads.stage, so nothing has to be migrated).
insert into crm_pipelines (name, position, stages)
select 'Sales Pipeline', 0, '[
  {"key":"new",              "label":"New",         "color":"rgba(240,232,212,0.4)"},
  {"key":"contacted",        "label":"Contacted",   "color":"rgba(143,208,255,0.7)"},
  {"key":"nurturing",        "label":"Nurturing",   "color":"rgba(201,164,85,0.7)"},
  {"key":"application_sent", "label":"App Sent",     "color":"rgba(201,164,85,0.9)"},
  {"key":"call_booked",      "label":"Call Booked",  "color":"#4ade80"},
  {"key":"call_held",        "label":"Call Held",    "color":"#34d399"},
  {"key":"closed_won",       "label":"Closed Won",   "color":"#4ade80"},
  {"key":"closed_lost",      "label":"Closed Lost",  "color":"rgba(239,68,68,0.7)"},
  {"key":"ghosted",          "label":"Ghosted",      "color":"rgba(240,232,212,0.25)"}
]'::jsonb
where not exists (select 1 from crm_pipelines where name = 'Sales Pipeline');

-- Backfill every existing lead onto the Sales Pipeline.
update crm_leads
set pipeline_id = (select id from crm_pipelines where name = 'Sales Pipeline' order by created_at limit 1)
where pipeline_id is null;

-- Freebie Leads: everyone who opts into a freebie lands in "Opt-Ins".
insert into crm_pipelines (name, position, stages)
select 'Freebie Leads', 1, '[
  {"key":"opt_ins",      "label":"Opt-Ins",      "color":"#8FD0FF"},
  {"key":"contacted",    "label":"Contacted",    "color":"rgba(143,208,255,0.7)"},
  {"key":"qualified",    "label":"Qualified",    "color":"#4ade80"},
  {"key":"disqualified", "label":"Disqualified", "color":"rgba(239,68,68,0.7)"}
]'::jsonb
where not exists (select 1 from crm_pipelines where name = 'Freebie Leads');
