-- CRM AI Assistant persistence — its OWN database, separate from every other bot
-- and from the CRM data tables (crm_leads / crm_touchpoints). Same triple pattern
-- as supabase-salesbot-ai.sql, plus a `crmbot_context` table that stores the
-- transcripts extracted from screenshots / screen recordings the user feeds it.
--
-- The CRM assistant reads ONLY: the CRM data (via CRM_TOOLS in lib/ai/tools.ts)
-- and whatever the user gives it (crmbot_context). It has no client/sales tools.
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).
-- Every write is non-fatal in app code, so the bot works before this runs
-- (it just won't persist conversations, memory, or extracted context).

create table if not exists public.crmbot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crmbot_conversations_user_idx on public.crmbot_conversations (user_email, updated_at desc);

create table if not exists public.crmbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crmbot_conversations(id) on delete cascade,
  user_email text,
  role text not null,                 -- 'user' | 'assistant'
  content text not null,
  tools_used jsonb,                   -- which CRM tools the bot read (audit)
  meta jsonb,                         -- structured render data (reserved)
  created_at timestamptz not null default now()
);
create index if not exists crmbot_messages_conv_idx on public.crmbot_messages (conversation_id, created_at);

create table if not exists public.crmbot_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  scope text,                         -- optional tag (e.g. a lead handle / topic)
  source_conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists crmbot_memory_recent_idx on public.crmbot_memory (created_at desc);
create index if not exists crmbot_memory_scope_idx  on public.crmbot_memory (scope);

-- Messages extracted from screenshots / screen recordings the user shared.
-- Stored once (vision is expensive) and injected into the assistant's context on
-- every follow-up turn, so the AI keeps "seeing" what you fed it without re-reading images.
create table if not exists public.crmbot_context (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.crmbot_conversations(id) on delete cascade,
  user_email text,
  source_type text,                   -- 'screenshot' | 'recording'
  label text,                         -- optional user note (e.g. which lead)
  transcript text not null,           -- the extracted, structured message thread
  image_count int,                    -- how many images/frames were read
  created_at timestamptz not null default now()
);
create index if not exists crmbot_context_conv_idx on public.crmbot_context (conversation_id, created_at);

-- RLS on, no policies — service-role server access only (same as the other bots).
do $$ declare t text; begin
  foreach t in array array['crmbot_conversations','crmbot_messages','crmbot_memory','crmbot_context'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
