-- Calendly strategy-call bookings in the CRM (lib/calendly-crm.ts).
--
-- Every booking on the strategy-call calendars becomes a CRM lead, routed by its
-- UTM tracking. These columns hold what the booking itself tells us, so it can be
-- filtered and reported on instead of only living in the notes text.
--
-- Safe to run before or after deploying: until it's run, the booking write drops
-- these columns and retries (lib/db-write.ts), so leads still land — just without
-- the structured UTM fields.

alter table public.crm_leads add column if not exists utm_source   text;
alter table public.crm_leads add column if not exists utm_medium   text;
alter table public.crm_leads add column if not exists utm_campaign text;
alter table public.crm_leads add column if not exists utm_content  text;
alter table public.crm_leads add column if not exists utm_term     text;

-- Scheduled start of the booked call, the calendar it was booked on, and the
-- Calendly event it came from (so a re-run of the backfill recognises it).
alter table public.crm_leads add column if not exists booked_at    timestamptz;
alter table public.crm_leads add column if not exists calendar     text;
alter table public.crm_leads add column if not exists calendly_event_uri text;

create index if not exists crm_leads_utm_source_idx on public.crm_leads (utm_source);
create index if not exists crm_leads_booked_at_idx  on public.crm_leads (booked_at desc);
create index if not exists crm_leads_calendly_event_idx on public.crm_leads (calendly_event_uri);

-- Deliberately NOT unique: one Calendly event can carry more than one invitee,
-- and a lead who books again should update in place rather than fail a write.
