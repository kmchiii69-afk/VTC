-- Acquisition Dashboard — admin-managed GLOBAL content.
-- Run this once in the Supabase SQL editor (same project as `portal_users`).
-- Mirrors the existing manual-table convention (no migration framework in this repo).
--
-- Unlike `acquisition_content` (per-client), this table is keyed by page id only:
-- admins fill in the "Building" / reference pages and the content shows for
-- EVERY acquisition-tagged client.
--   data → { "text": "…markdown…",
--            "links": [ { "id", "label", "url" } ],
--            "files": [ { "id", "name", "url" } ] }   (PDFs in the 'acquisition-docs' bucket)

create table if not exists public.acquisition_admin_content (
  page_id     text        primary key,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
