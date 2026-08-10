-- Action items (assigned tasks for clients)
-- Run once in the Supabase SQL editor (same project as portal_users / check_ins).
--
-- Items come from two sources:
--   'admin' — manually assigned by a coach/admin in the Admin Panel.
--   'ai'    — auto-extracted from a check-in's action steps (deduped by text).
-- Clients tick items complete from their portal; admins can override.

create table if not exists public.action_items (
  id            uuid primary key default gen_random_uuid(),
  client_email  text not null,
  text          text not null,
  status        text not null default 'open',     -- 'open' | 'completed'
  source        text not null default 'admin',    -- 'admin' | 'ai'
  due_date      date,                              -- optional; drives overdue alerts
  assigned_by   text,                              -- admin email (null for ai)
  check_in_id   uuid,                              -- provenance for ai items
  completed_at  timestamptz,
  completed_by  text,                              -- 'client' or an admin email
  created_at    timestamptz not null default now()
);

create index if not exists action_items_client_idx on public.action_items (client_email);
create index if not exists action_items_status_idx on public.action_items (status);

-- Dedup AI-generated items: at most one row per (client, exact text) for source='ai',
-- so the same step recurring across check-ins doesn't re-create (or un-complete) it.
create unique index if not exists action_items_ai_text_uniq
  on public.action_items (client_email, text) where source = 'ai';
