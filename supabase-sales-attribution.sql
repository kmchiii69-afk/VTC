-- Sales-call → client attribution.
-- Adds a nullable client_email to `calls`: when a sales call's attendee email
-- matches a portal member, the call is linked to that client (set server-side by
-- lib/sales-attribution.ts) and surfaced on their CSM journey. Nullable — most
-- sales calls are with prospects who are NOT yet members, so they stay unlinked.
--
-- Run once in the Supabase SQL editor (same project as portal_users / calls).
-- Safe to re-run: every statement is idempotent.

alter table public.calls add column if not exists client_email text;

-- Fast "this client's sales calls" lookup for the CSM journey view.
create index if not exists calls_client_email_idx on public.calls (client_email);
