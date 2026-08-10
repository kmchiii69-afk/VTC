-- CRM setter follow-up cadence
-- Run this in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- What it does:
--   1. Adds the two cadence timestamps to crm_leads:
--        last_activity_at  — stamped on every stage change / logged touchpoint
--        reset_at          — stamped when a lead flips to No Show / Cancelled,
--                            which forces a daily cadence for the next 7 days
--      (next_followup_at already exists and stays the "Next Follow-Up Date".)
--   2. Backfills last_activity_at from updated_at so existing leads have an anchor.
--   3. Adds the setter stages the workflow needs to the "Sales Pipeline"
--      (Rescheduled / No Show / Cancelled / Follow-Up Call / DQ) without
--      touching any custom stages already on it.
--
-- "Follow-Up?" and "Next Follow-Up Date" are computed in app code
-- (lib/crm-followup.ts) rather than as DB formulas, so one definition drives the
-- API writes and the Due Today view. Until this SQL is run the app degrades
-- gracefully: it falls back to updated_at and skips the reset window.

-- ── 1. Cadence columns ────────────────────────────────────────────────────
alter table crm_leads add column if not exists last_activity_at timestamptz;
alter table crm_leads add column if not exists reset_at         timestamptz;

-- ── 2. Backfill the activity anchor ───────────────────────────────────────
update crm_leads
set last_activity_at = coalesce(updated_at, created_at)
where last_activity_at is null;

create index if not exists crm_leads_last_activity_idx on crm_leads (last_activity_at);

-- ── 3. Setter stages on the Sales Pipeline ────────────────────────────────
-- Replaces the stage list with the full setter flow, then re-appends any stage
-- already on the pipeline that isn't in that list (so custom stages survive).
do $$
declare
  target jsonb := '[
    {"key":"new",              "label":"New",            "color":"rgba(240,232,212,0.4)"},
    {"key":"contacted",        "label":"Contacted",      "color":"rgba(143,208,255,0.7)"},
    {"key":"nurturing",        "label":"Nurturing",      "color":"rgba(201,164,85,0.7)"},
    {"key":"application_sent", "label":"App Sent",       "color":"rgba(201,164,85,0.9)"},
    {"key":"call_booked",      "label":"Call Booked",    "color":"#4ade80"},
    {"key":"rescheduled",      "label":"Rescheduled",    "color":"#8FD0FF"},
    {"key":"no_show",          "label":"No Show",        "color":"#F0826D"},
    {"key":"cancelled",        "label":"Cancelled",      "color":"#F0826D"},
    {"key":"call_held",        "label":"Call Held",      "color":"#34d399"},
    {"key":"follow_up_call",   "label":"Follow-Up Call", "color":"#F5E6A3"},
    {"key":"closed_won",       "label":"Closed Won",     "color":"#4ade80"},
    {"key":"dq",               "label":"DQ",             "color":"#f97316"},
    {"key":"closed_lost",      "label":"Closed Lost",    "color":"rgba(239,68,68,0.7)"},
    {"key":"ghosted",          "label":"Ghosted",        "color":"rgba(240,232,212,0.25)"}
  ]'::jsonb;
  p record;
  extra jsonb;
begin
  for p in select id, stages from crm_pipelines where name = 'Sales Pipeline' loop
    select coalesce(jsonb_agg(s), '[]'::jsonb) into extra
    from jsonb_array_elements(p.stages) s
    where not exists (
      select 1 from jsonb_array_elements(target) t where t->>'key' = s->>'key'
    );
    update crm_pipelines set stages = target || extra where id = p.id;
  end loop;
end $$;

-- ── 4. OPTIONAL backfill: put existing sales leads into the daily queue ───
-- Not run by default: every lead given a next_followup_at shows up in Due Today,
-- so this would drop the whole back catalogue on the setter at once. Uncomment
-- when you actually want to start working the existing list.
--
-- update crm_leads
-- set next_followup_at = date_trunc('day', now()) + interval '9 hours'
-- where pipeline_id = (select id from crm_pipelines where name = 'Sales Pipeline' order by created_at limit 1)
--   and next_followup_at is null
--   and stage not in ('call_booked','rescheduled','closed_won','closed_lost','dq','ghosted');
