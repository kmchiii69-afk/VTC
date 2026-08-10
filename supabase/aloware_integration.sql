-- Aloware integration
-- Run this in the Supabase SQL editor. Idempotent — safe to run more than once.
--
-- What it does:
--   1. Adds crm_leads.aloware_contact_id — the id Aloware assigns the contact we
--      push, so we can deep-link to its history and match a webhook without
--      falling back to a phone-number scan.
--   2. Adds crm_leads.aloware_synced_at — when we last pushed this lead, so the
--      sweep in app/api/cron/close-sync can find leads edited since and re-push.
--   3. Adds crm_touchpoints.external_id with a UNIQUE index — the dedupe key for
--      call and SMS activity arriving from Aloware. Aloware fires several webhooks
--      for one call ("communication disposed", then "recording saved", then
--      "transcription saved"), and they can land concurrently. Checking for an
--      existing row in app code loses that race; a unique index does not, so the
--      receiver inserts and treats a conflict as "already logged".
--      Partial (WHERE NOT NULL) so the touchpoints already in the table — which
--      have no external id — don't all collide on NULL.
--   4. Widens the crm_touchpoints channel check to allow 'sms'. Texts sent from
--      Aloware are neither 'whatsapp' nor 'other', and the Due Today cadence reads
--      better when a text looks like a text.
--
-- No table is created for raw Aloware events on purpose: the touchpoint row IS the
-- record, and external_id makes replaying a webhook a no-op.

alter table crm_leads add column if not exists aloware_contact_id text;
alter table crm_leads add column if not exists aloware_synced_at timestamptz;

create index if not exists crm_leads_aloware_contact_id_idx on crm_leads (aloware_contact_id);

alter table crm_touchpoints add column if not exists external_id text;

create unique index if not exists crm_touchpoints_external_id_key
  on crm_touchpoints (external_id)
  where external_id is not null;

alter table crm_touchpoints drop constraint if exists crm_touchpoints_channel_check;
alter table crm_touchpoints add constraint crm_touchpoints_channel_check
  check (channel in ('ig_dm', 'whatsapp', 'call', 'sms', 'email', 'other'));
