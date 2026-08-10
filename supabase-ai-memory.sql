-- Per-bot AI persistence: conversation logs + a memory store each bot writes
-- insights into and recalls in future chats. Separate tables per bot
-- (csm / advisor / content) so each bot owns its own store.
--
-- Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).
--
-- Recall is by recency + lightweight topic match (no embeddings / no external
-- API). Every write is non-fatal in app code, so the bots work before this runs.

-- ── CSM bot ──────────────────────────────────────────────────────────────────
create table if not exists public.csm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists csm_conversations_user_idx on public.csm_conversations (user_email, updated_at desc);

create table if not exists public.csm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.csm_conversations(id) on delete cascade,
  user_email text,
  role text not null,                 -- 'user' | 'assistant'
  content text not null,
  tools_used jsonb,                   -- which tools/data the bot read (audit)
  created_at timestamptz not null default now()
);
create index if not exists csm_messages_conv_idx on public.csm_messages (conversation_id, created_at);

create table if not exists public.csm_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  scope text,                         -- optional tag (e.g. client email / topic)
  source_conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists csm_memory_recent_idx on public.csm_memory (created_at desc);
create index if not exists csm_memory_scope_idx  on public.csm_memory (scope);

-- ── Advisor bot ──────────────────────────────────────────────────────────────
create table if not exists public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_email text, title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists advisor_conversations_user_idx on public.advisor_conversations (user_email, updated_at desc);

create table if not exists public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  user_email text, role text not null, content text not null, tools_used jsonb,
  created_at timestamptz not null default now()
);
create index if not exists advisor_messages_conv_idx on public.advisor_messages (conversation_id, created_at);

create table if not exists public.advisor_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null, scope text, source_conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists advisor_memory_recent_idx on public.advisor_memory (created_at desc);
create index if not exists advisor_memory_scope_idx  on public.advisor_memory (scope);

-- ── Content bot ──────────────────────────────────────────────────────────────
create table if not exists public.content_conversations (
  id uuid primary key default gen_random_uuid(),
  user_email text, title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_conversations_user_idx on public.content_conversations (user_email, updated_at desc);

create table if not exists public.content_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.content_conversations(id) on delete cascade,
  user_email text, role text not null, content text not null, tools_used jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_messages_conv_idx on public.content_messages (conversation_id, created_at);

create table if not exists public.content_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null, scope text, source_conversation_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists content_memory_recent_idx on public.content_memory (created_at desc);
create index if not exists content_memory_scope_idx  on public.content_memory (scope);

-- RLS (service-role writes bypass it)
do $$ declare t text; begin
  foreach t in array array[
    'csm_conversations','csm_messages','csm_memory',
    'advisor_conversations','advisor_messages','advisor_memory',
    'content_conversations','content_messages','content_memory'] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop; end $$;
