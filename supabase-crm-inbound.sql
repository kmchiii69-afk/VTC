-- Inbound calls + texts on the CRM timeline (app/api/webhooks/twilio/{inbound,sms}).
--
-- Only widens the touchpoint channel list so an inbound SMS can be logged as
-- 'sms' instead of 'other'. Everything else the inbound routes write uses
-- columns that already exist (crm_calls.direction is free text, and it already
-- allows 'inbound').
--
-- Safe to run before or after deploying: until it's run, the SMS webhook retries
-- the insert as channel 'other', so texts are still logged.

alter table public.crm_touchpoints
  drop constraint if exists crm_touchpoints_channel_check;

alter table public.crm_touchpoints
  add constraint crm_touchpoints_channel_check
  check (channel in ('ig_dm', 'whatsapp', 'sms', 'call', 'email', 'other'));
