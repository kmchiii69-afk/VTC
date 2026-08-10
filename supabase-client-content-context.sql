-- Per-client content context for the /select scripting/content bot. Caches the
-- text the bot uses to tailor reviews to each client's own ICP/offer (instead of
-- SooWei's): their uploaded offer PDF, their onboarding submitted docs, and a
-- roadmap-progress summary. Run once.

create table if not exists public.client_content_context (
  client_email     text primary key,
  offer_upload_text text,   -- extracted from a PDF the client uploaded to the bot
  onboarding_text   text,   -- extracted from their onboarding "submit docs" PDFs
  roadmap_text      text,   -- roadmap progress summary
  updated_at        timestamptz not null default now()
);
alter table public.client_content_context enable row level security;
