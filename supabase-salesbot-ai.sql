-- Sales AI bot persistence: its own conversation log + memory store, separate
-- from the csm / advisor / content bots (same pattern as supabase-ai-memory.sql).
-- The Sales bot only ever reads sales-call data (see SALES_TOOLS in lib/ai/tools.ts);
-- this gives it a private place to log chats and accumulate sales insights.
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).
-- Recall is recency + lightweight topic match (no embeddings). Every write is
-- non-fatal in app code, so the bot works before this runs (just won't persist).

create table if not exists public.salesbot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists salesbot_conversations_user_idx on public.salesbot_conversations (user_email, updated_at desc);

create table if not exists public.salesbot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.salesbot_conversations(id) on delete cascade,
  user_email text,
  role text not null,                 -- 'user' | 'assistant'
  content text not null,
  tools_used jsonb,                   -- which tools/data the bot read (audit)
  created_at timestamptz not null default now()
);
create index if not exists salesbot_messages_conv_idx on public.salesbot_messages (conversation_id, created_at);

create table if not exists public.salesbot_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  scope text,                         -- optional tag (e.g. objection / closer / topic)
  source_conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists salesbot_memory_recent_idx on public.salesbot_memory (created_at desc);
create index if not exists salesbot_memory_scope_idx  on public.salesbot_memory (scope);

-- RLS on, no policies — service-role server access only (same as the other bots).
do $$ declare t text; begin
  foreach t in array array['salesbot_conversations','salesbot_messages','salesbot_memory'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
