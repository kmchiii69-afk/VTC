-- Acquisition Dashboard — per-client editable content.
-- Run this once in the Supabase SQL editor (same project as `portal_users`).
-- Mirrors the existing manual-table convention (no migration framework in this repo).
--
-- One row per (client × Acquisition Dashboard page). `data` is a free-form JSON
-- blob whose shape depends on the page kind (see lib/acquisition-config.ts):
--   links   → { "items": [ { "id", "label", "url" } ] }   (Personal SOPs, Important Links)
--   cash    → { "rows":  [ { "id", "month", "cash", "range" } ] }  (Cash Tracker)
--   doc     → { "text": "…markdown…" }                    (Your Lifestory, PMF, Offer Positioning)
--   product → { "text": "…", "pdf": { "url", "name" } }   (The Product)

create table if not exists public.acquisition_content (
  user_email  text        not null,
  page_id     text        not null,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_email, page_id)
);

-- Fast lookup of everything one client has authored.
create index if not exists acquisition_content_user_idx
  on public.acquisition_content (user_email);

-- Uploaded PDFs (The Product) live in a public Storage bucket named
-- 'acquisition-docs'. The app creates it automatically on first upload, so no
-- manual bucket setup is required.
