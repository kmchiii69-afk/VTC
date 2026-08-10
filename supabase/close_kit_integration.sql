-- Close + Kit integration
-- Run this in the Supabase SQL editor. Idempotent — safe to run more than once.
--
-- What it does:
--   1. Adds close_lead_id to crm_leads — the id Close returns when we push a
--      lead, so re-syncing updates that lead instead of duplicating it, we can
--      deep-link to its dialer, and we can pull its call activity back.
--   2. Adds close_opportunity_id — the opportunity that parks the lead on the
--      Close pipeline stage mirroring its CRM stage (updated, not recreated, when
--      the lead moves stage in the CRM).
--   3. Adds close_synced_at — when we last pushed this lead, so the sweep in
--      app/api/cron/close-sync can find leads edited since and re-push them.
--   4. Indexes close_lead_id: the call-activity lookups and the "not yet in
--      Close" backfill query both filter on it.
--
-- Kit needs no schema change: it addresses subscribers by email (already on
-- crm_leads.email) and logs its actions to crm_touchpoints, whose channel enum
-- already includes 'email'. Call activity from Close logs to crm_touchpoints too
-- (channel 'call').

alter table crm_leads add column if not exists close_lead_id text;
alter table crm_leads add column if not exists close_opportunity_id text;
alter table crm_leads add column if not exists close_synced_at timestamptz;

create index if not exists crm_leads_close_lead_id_idx on crm_leads (close_lead_id);
