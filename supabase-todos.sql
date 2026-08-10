-- Client to-do list (the floating-bubble to-dos).
-- Run once in the Supabase SQL editor (same project as portal_users / action_items).
--
-- Per-client items that BOTH the client (via their bubble) and an admin (via the
-- CSM client profile) can add / edit / remove. Distinct from `action_items`
-- (which are coach/AI-assigned and feed the roadmap + journey).

create table if not exists public.client_todos (
  id             uuid primary key default gen_random_uuid(),
  client_email   text not null,
  text           text not null,
  category       text not null,                       -- 'Fulfilment' | 'Sales' | 'Content' | 'Systems'
  priority       integer not null default 3,          -- 1 (highest) → 4 (lowest)
  assigned_date  date not null default current_date,  -- auto-set to today on add; editable
  due_date       date,                                -- optional
  done           boolean not null default false,
  created_by     text,                                -- 'client' or an admin email
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists client_todos_email_idx on public.client_todos (client_email);

-- If the table already existed before priority was added, run this too (safe to
-- re-run):
alter table public.client_todos
  add column if not exists priority integer not null default 3;

-- Acquisition "Actionables" board: split a member's items into two per-member
-- lists (Program / Individual) and group them by an open-ended week number.
-- Existing rows default to the Individual list with no week (safe to re-run).
alter table public.client_todos
  add column if not exists list text not null default 'individual',  -- 'program' | 'individual'
  add column if not exists week integer;                             -- open-ended week #; null = unscheduled

create index if not exists client_todos_list_idx on public.client_todos (client_email, list);

-- Manual drag-and-drop ordering. Lower sort_order shows first (within a week
-- group). Existing rows default to 0 (a tie), so they keep their priority/date
-- ordering until someone reorders them. Safe to re-run.
alter table public.client_todos
  add column if not exists sort_order integer not null default 0;
