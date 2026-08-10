-- Admin-managed Resources library for the member portal (Resources tab).
-- Houses the docs that used to be external Google Doc links (Referral Program,
-- Onboarding Overview, Market Research / PMF, Offer Doc, etc.) as in-app pages.
--
-- Each resource is one of:
--   'native'   — content authored in `body` (markdown), rendered in-app
--   'embed'    — read-only iframe of `embed_url` (use an embed-safe URL, e.g. a
--                Google Docs /preview link or a published-to-web URL)
--   'template' — a fillable doc: show `body` instructions + a "Make your copy"
--                button to `template_url`, then the client uploads the result
--
-- Reads auto-seed from DEFAULT_RESOURCES (lib/resources-data.ts) on first access.
-- Until this runs, the Resources tab serves the static defaults read-only (admin
-- edits won't persist). Run once in the Supabase SQL editor (project mqaufrypvxrmvzknmnvs).

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null default 'Resources',
  type text not null default 'native',          -- 'native' | 'embed' | 'template'
  body text not null default '',                  -- markdown (native content / template instructions)
  embed_url text,                                 -- for type 'embed'
  template_url text,                              -- for type 'template' (doc to duplicate/fill)
  upload_step_id text,                            -- optional: reuse the onboarding upload flow (e.g. 'submit-docs')
  upload_slot text,                               -- optional: onboarding upload slot (e.g. 'pmf' | 'offer')
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resources_order_idx on public.resources (sort_order);

-- RLS on, no policies — service-role server access only (same as the other tables).
alter table public.resources enable row level security;
