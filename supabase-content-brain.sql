-- Team-shared Content Brain for the /select content bot — the structured
-- knowledge it accumulates (approved hooks, ideas, recurring objections, proven
-- mechanics). Replaces the per-browser localStorage store. Run once.

create table if not exists public.content_brain (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- 'hook' | 'idea' | 'objection' | 'mechanic'
  text text not null,                 -- dedupe/display key (hook text / idea title / objection / mechanic)
  data jsonb,                         -- full structured item (idea fields, hook concept, objection category…)
  count integer not null default 1,   -- objection frequency
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists content_brain_kind_text_uniq on public.content_brain (kind, lower(text));
create index if not exists content_brain_kind_idx on public.content_brain (kind, created_at desc);
alter table public.content_brain enable row level security;
